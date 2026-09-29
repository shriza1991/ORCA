#!/bin/sh
set -e

echo "[ORCA ENTRYPOINT] Initializing container runtime..."

# Run database readiness check and Alembic migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
    echo "[ORCA ENTRYPOINT] Waiting for database availability..."
    python - << 'EOF'
import os
import sys
import time
from sqlalchemy import create_engine, text

db_url = os.getenv("DATABASE_URL", "")
if db_url.startswith("postgres://"):
    sync_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif db_url.startswith("postgresql+asyncpg://"):
    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
elif db_url.startswith("postgresql://"):
    sync_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
else:
    sync_url = db_url

max_attempts = int(os.getenv("DB_CONNECT_RETRIES", "15"))
engine = create_engine(sync_url, connect_args={"connect_timeout": 5})

for attempt in range(1, max_attempts + 1):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"[ORCA ENTRYPOINT] Database connection confirmed on attempt {attempt}.")
        sys.exit(0)
    except Exception as exc:
        print(f"[ORCA ENTRYPOINT] DB connection pending (attempt {attempt}/{max_attempts}): {exc}")
        time.sleep(2)

print("[ORCA ENTRYPOINT] ERROR: Timed out waiting for database connection.")
sys.exit(1)
EOF

    echo "[ORCA ENTRYPOINT] Applying Alembic migrations (upgrade head)..."
    python -m alembic upgrade head
    echo "[ORCA ENTRYPOINT] Database schema migrations completed successfully."
else
    echo "[ORCA ENTRYPOINT] No DATABASE_URL configured; skipping migrations."
fi

echo "[ORCA ENTRYPOINT] Launching command: $@"
exec "$@"
