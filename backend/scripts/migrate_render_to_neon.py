"""Additive PostgreSQL data migration. DSNs come only from environment.
Makes a private source backup, validates conflicts, commits atomically, never changes source.
"""
import os,json,gzip,hashlib
from pathlib import Path
from datetime import datetime, timezone
import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json, execute_values, register_uuid


def connect(url):
    return psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://").replace("postgresql+asyncpg://", "postgresql://"), connect_timeout=10)


def canonical(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict): return {k:canonical(v) for k,v in value.items()}
    if isinstance(value, (list,tuple)): return [canonical(v) for v in value]
    if isinstance(value, memoryview): return value.tobytes().hex()
    if value is None or isinstance(value,(str,int,float,bool)): return value
    return str(value)


def main():
    register_uuid()
    src = connect(os.environ["SOURCE_DATABASE_URL"])
    dst = connect(os.environ["TARGET_DATABASE_URL"])
    src.set_session(readonly=True, isolation_level="REPEATABLE READ")
    dst.set_session(isolation_level="SERIALIZABLE")
    source, target = src.cursor(), dst.cursor()
    source.execute("select tablename from pg_tables where schemaname='public' and tablename not in ('spatial_ref_sys','alembic_version') order by tablename")
    tables = [r[0] for r in source.fetchall()]
    backup = {}
    for table in tables:
        source.execute(sql.SQL("select * from public.{}").format(sql.Identifier(table)))
        cols = [d.name for d in source.description]
        backup[table] = {"columns":cols,"rows":source.fetchall()}
    path = Path(os.environ["MIGRATION_BACKUP_PATH"])
    path.parent.mkdir(parents=True,exist_ok=True)
    blob=json.dumps({k:{"columns":v["columns"],"rows":canonical(v["rows"])} for k,v in backup.items()}, default=canonical, sort_keys=True).encode()
    with gzip.open(path,"wb") as f: f.write(blob)
    print("Source backup stored privately; SHA256:",hashlib.sha256(blob).hexdigest())
    target.execute("select tablename from pg_tables where schemaname='public'")
    target_tables={r[0] for r in target.fetchall()}
    pending=set(t for t in tables if backup[t]["rows"])
    missing=pending-target_tables
    if missing: raise RuntimeError("Nonempty source tables absent from target: "+','.join(sorted(missing)))
    target.execute("select conrelid::regclass::text, confrelid::regclass::text from pg_constraint where contype='f'")
    deps={t:set() for t in pending}
    for child,parent in target.fetchall():
        child,parent=child.split('.')[-1],parent.split('.')[-1]
        if child in pending and parent in pending and child!=parent: deps[child].add(parent)
    copied={}
    while pending:
        ready=sorted(t for t in pending if not deps[t].intersection(pending))
        if not ready: raise RuntimeError("Cyclic foreign keys require explicit migration review")
        for table in ready:
            columns=backup[table]["columns"]
            target.execute("select column_name,data_type from information_schema.columns where table_schema='public' and table_name=%s",(table,))
            types=dict(target.fetchall())
            if set(columns)-set(types): raise RuntimeError("Source columns missing from target: "+table)
            target.execute("select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=%s::regclass and i.indisprimary",(table,))
            pk=[r[0] for r in target.fetchall()]
            if not pk: raise RuntimeError("No primary key: "+table)
            target.execute(sql.SQL('select {} from {}').format(sql.SQL(',').join(map(sql.Identifier,columns)),sql.Identifier(table)))
            existing={tuple(row[columns.index(k)] for k in pk):row for row in target.fetchall()}
            values=[]
            for row in backup[table]['rows']:
                key=tuple(row[columns.index(k)] for k in pk)
                if key in existing:
                    if canonical(list(row))!=canonical(list(existing[key])): raise RuntimeError("Conflicting existing primary key in "+table)
                    continue
                values.append(tuple(Json(v) if types[col] in ('json','jsonb') and v is not None else v for col,v in zip(columns,row)))
            if values:
                statement=sql.SQL('insert into {} ({}) values %s').format(sql.Identifier(table),sql.SQL(',').join(map(sql.Identifier,columns)))
                execute_values(target,statement.as_string(dst),values,page_size=200)
            target.execute(sql.SQL('select count(*) from {}').format(sql.Identifier(table)))
            copied[table]={"source":len(backup[table]['rows']),"added":len(values),"target":target.fetchone()[0]}
            pending.remove(table)
    dst.commit();src.rollback();src.close();dst.close()
    print(json.dumps(copied,sort_keys=True))

if __name__=='__main__': main()
