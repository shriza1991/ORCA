"""Hermetic community persistence, privacy, confirmation and media regressions."""
from datetime import datetime,timezone,timedelta
from io import BytesIO
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
from PIL import Image
from backend.app.main import app
from backend.app.db.session import get_db
from backend.app.db.field_intelligence_models import FieldObservation,FieldConfirmation
from backend.app.core.config import settings

@compiles(JSONB, "sqlite")
def sqlite_json(element,compiler,**kw):return "JSON"

@pytest.fixture
def client(monkeypatch):
    engine=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
    FieldObservation.__table__.create(engine)
    FieldConfirmation.__table__.create(engine)
    sessions=sessionmaker(bind=engine)
    def dependency():
        with sessions() as db:yield db
    app.dependency_overrides[get_db]=dependency
    monkeypatch.setattr(settings,"COMMUNITY_HASH_SECRET","test-only-secret")
    yield TestClient(app)
    app.dependency_overrides.pop(get_db,None);engine.dispose()


def reporter():return {"X-Field-Reporter":str(uuid.uuid4())}


def payload(**changes):
    return dict(observation_type="ROUGH_SEA",severity="MODERATE",description="2m swell near harbour",latitude=16.985,longitude=73.285,harbor_reference="Ratnagiri",**changes)


def test_community_demo_feed(client):
    data=client.get("/api/v1/community/observations/demo").json()
    assert data["observations"] and "do not imply safe" in data["epistemic_notice"].lower()
    for obs in data["observations"]:
        assert obs["source_type"]=="COMMUNITY" and obs["data_mode"]=="DEMO"
        assert obs["lineage_label"]=="[FIELD SIGNAL]" and obs["is_demo"]
        assert obs["persistence"]=="DEMO_FIXTURE" and obs["official_agreement"] is None
        assert "exact_latitude" not in obs and "contributor_hash" not in obs


def test_community_observation_submit_and_corroborate(client):
    owner=reporter()
    response=client.post("/api/v1/community/observations",json=payload(),headers=owner)
    assert response.status_code==201,response.text
    created=response.json();pid=created["public_id"]
    assert created["public_id"].startswith("OBS-") and created["persistence"]=="DATABASE"
    assert created["contributor_trust"]=="UNVERIFIED" and created["corroboration_count"]==0
    assert created["data_mode"]=="FIELD_SIGNAL" and "exact_latitude" not in created
    assert abs(created["approx_latitude"]-16.985)<0.04
    assert client.get(f"/api/v1/community/observations/{pid}").json()["public_id"]==pid
    confirm={"latitude":16.985,"longitude":73.285,"agrees":True}
    assert client.post(f"/api/v1/community/observations/{pid}/corroborate",json=confirm,headers=owner).status_code==409
    second=reporter()
    assert client.post(f"/api/v1/community/observations/{pid}/corroborate",json=confirm,headers=second).json()["corroboration_count"]==1
    assert client.post(f"/api/v1/community/observations/{pid}/corroborate",json=confirm,headers=second).status_code==409
    for _ in range(2):result=client.post(f"/api/v1/community/observations/{pid}/corroborate",json=confirm,headers=reporter())
    assert result.json()["corroboration_count"]==3 and result.json()["verification_status"]=="CORROBORATED"
    assert result.json()["contributor_trust"]=="UNVERIFIED" and result.json()["official_agreement"] is None


def test_disagreement_and_distance_do_not_add_confirmation(client):
    created=client.post("/api/v1/community/observations",json=payload(),headers=reporter()).json()
    url=f"/api/v1/community/observations/{created['public_id']}/corroborate"
    disagree=client.post(url,json={"latitude":16.985,"longitude":73.285,"agrees":False},headers=reporter())
    assert disagree.json()["corroboration_count"]==0
    assert client.post(url,json={"latitude":0,"longitude":0},headers=reporter()).status_code==422


def test_community_empty_feed_safety_invariant_c2(client):
    data=client.get("/api/v1/community/observations?harbor=NonExistentHarbor999").json()
    assert data["observations"]==[] and "do not imply safe" in data["epistemic_notice"].lower()


def test_database_failure_never_reports_a_saved_record(client):
    class Unavailable:
        def add(self,*a):pass
        def commit(self):raise RuntimeError("private credential")
        def rollback(self):pass
        def query(self,*a):raise RuntimeError("private credential")
    app.dependency_overrides[get_db]=lambda:Unavailable()
    response=client.post("/api/v1/community/observations",json=payload(),headers=reporter())
    assert response.status_code==503 and "not saved" in response.text
    assert "private credential" not in response.text
    assert client.get("/api/v1/community/observations").status_code==503


def test_private_photo_and_key_ownership(client,monkeypatch):
    from backend.app.services import field_media
    objects={}
    class Storage:
        def put_object(self,**kw):objects[kw["Key"]]=kw["Body"]
        def head_object(self,**kw):return {"ContentType":"image/jpeg","ContentLength":len(objects[kw["Key"]])}
        def generate_presigned_url(self,*a,**kw):return "https://private.example/short-lived"
    monkeypatch.setattr(field_media,"storage_client",lambda:Storage())
    owner=reporter();data=BytesIO();Image.new("RGB",(16,16)).save(data,"PNG")
    response=client.post("/api/v1/community/media",files={"file":("photo.png",data.getvalue(),"image/png")},headers=owner)
    assert response.status_code==201,response.text
    key=response.json()["key"];assert response.json()["access"]=="private"
    assert Image.open(BytesIO(objects[key])).format=="JPEG"
    assert not Image.open(BytesIO(objects[key])).getexif()
    assert client.get("/api/v1/community/media",params={"key":key},headers=owner).json()["expires_in_seconds"]==60
    assert client.get("/api/v1/community/media",params={"key":key},headers=reporter()).status_code==403
    saved=client.post("/api/v1/community/observations",json=payload(media_keys=[key]),headers=owner)
    assert saved.status_code==201 and saved.json()["evidence_count"]==1
    assert client.post("/api/v1/community/observations",json=payload(media_keys=[key]),headers=reporter()).status_code==403
    assert client.post("/api/v1/community/media",files={"file":("bad.jpg",b"invalid","image/jpeg")},headers=owner).status_code==422


def test_expired_and_demo_records_do_not_enter_live_feed(client):
    owner=reporter();client.post("/api/v1/community/observations",json=payload(is_demo=True),headers=owner)
    assert client.get("/api/v1/community/observations").json()["observations"]==[]
    assert client.get("/api/v1/community/observations?include_demo=true").json()["observations"]


def test_missing_reporter_is_rejected(client):
    assert client.post("/api/v1/community/observations",json=payload()).status_code==422


def test_expired_records_cannot_be_confirmed_or_counted_as_current(client):
    saved=client.post("/api/v1/community/observations",json=payload(),headers=reporter()).json()
    dep=app.dependency_overrides[get_db]()
    db=next(dep)
    record=db.query(FieldObservation).filter_by(public_id=saved["public_id"]).first()
    record.valid_until=datetime.now(timezone.utc)-timedelta(minutes=1)
    db.commit();dep.close()
    assert client.get("/api/v1/community/observations").json()["observations"]==[]
    result=client.post(f"/api/v1/community/observations/{saved['public_id']}/corroborate",json={"latitude":16.985,"longitude":73.285},headers=reporter())
    assert result.status_code==409


def test_polar_grid_is_bounded():
    from backend.app.api.v1.community import _approx_coords
    import math
    lat,lon=_approx_coords(90,180)
    assert math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180
