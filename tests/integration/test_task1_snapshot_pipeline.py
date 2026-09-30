"""Regression test suite for Task 1: Diagnosing and fixing snapshot conversational pipeline.

Verifies acceptance requirements A through J under DATA_MODE=SNAPSHOT and provider tools:
A. Ratnagiri safety request through POST /api/v1/chat.
B. Ratnagiri PFZ request through POST /api/v1/chat.
C. A supported fixture-window request using its actual date.
D. An out-of-coverage future request.
E. A genuinely missing fixture.
F. A recognized harbor alias (e.g. Ratnagiri Port, Mirkarwada).
G. Follow-up "Why?" using the returned conversation_id.
H. Unsupported geographic coverage does not silently become Ratnagiri evidence.
I. Path fix works when execution starts from the backend directory as well as repository root.
J. Container-equivalent packaged-data lookup.
"""

from datetime import datetime, timezone
import os
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from backend.app.connectors.errors import ConnectorMissingSnapshotError
from backend.app.connectors.snapshot import (
    KNOWN_HARBOR_ALIASES,
    SnapshotConnector,
    _resolve_candidate_dir,
)
from backend.app.core.config import settings
from backend.app.main import create_app


@pytest.fixture(autouse=True)
def setup_snapshot_mode(monkeypatch):
    """Ensure tests run deterministically in SNAPSHOT mode with fake/deterministic LLM."""
    monkeypatch.setenv("DATA_MODE", "SNAPSHOT")
    monkeypatch.setenv("LLM_MODE", "deterministic")
    settings.DATA_MODE = "SNAPSHOT"
    settings.LLM_MODE = "deterministic"


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


# ---------------------------------------------------------------------------
# Test A: Ratnagiri safety request through POST /api/v1/chat
# ---------------------------------------------------------------------------

def test_a_ratnagiri_safety_request(client):
    payload = {
        "message": "Is it safe to go fishing from Ratnagiri tomorrow morning?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
    data = response.json()

    # Must NOT have degraded ConnectorMissingSnapshotError warning
    warnings = data.get("warnings", [])
    assert not any("ConnectorMissingSnapshotError" in w for w in warnings), f"Degraded warning present: {warnings}"

    # Must have non-zero evidence and trace
    assert len(data.get("evidence", [])) > 0, "Expected evidence items"
    assert len(data.get("trace", [])) > 0, "Expected execution trace"
    assert data.get("intent") == "SAFETY"
    assert data.get("conversation_id") is not None


# ---------------------------------------------------------------------------
# Test B: Ratnagiri PFZ request through POST /api/v1/chat
# ---------------------------------------------------------------------------

def test_b_ratnagiri_pfz_request(client):
    payload = {
        "message": "Where is the nearest potential fishing zone from Ratnagiri?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
    data = response.json()

    warnings = data.get("warnings", [])
    assert not any("ConnectorMissingSnapshotError" in w for w in warnings), f"Degraded warning present: {warnings}"

    assert len(data.get("evidence", [])) > 0, "Expected PFZ evidence"
    assert len(data.get("trace", [])) > 0, "Expected execution trace"
    assert data.get("intent") == "PFZ"
    # Verify PFZ recommendation is grounded
    assert data.get("recommendation") is not None
    assert data.get("conversation_id") is not None


# ---------------------------------------------------------------------------
# Test C: A supported fixture-window request using its actual date
# ---------------------------------------------------------------------------

def test_c_supported_fixture_window(client):
    # 2026-09-30T06:00:00Z is directly in osf_hourly_observations.json
    payload = {
        "message": "What are the marine conditions at Ratnagiri today?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "departure_time": "2026-09-30T06:00:00Z",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert not any("ConnectorMissingSnapshotError" in w for w in data.get("warnings", []))
    assert len(data.get("evidence", [])) > 0
    # Must contain marine evidence with wave height
    wave_ev = next((e for e in data["evidence"] if e.get("metric_name") == "significant_wave_height"), None)
    assert wave_ev is not None, "Expected wave height evidence"
    assert wave_ev.get("metric_value") is not None


# ---------------------------------------------------------------------------
# Test D: An out-of-coverage future request
# ---------------------------------------------------------------------------

def test_d_out_of_coverage_future_request(client):
    # Date far outside the available fixture horizon (e.g. 2 weeks into future)
    payload = {
        "message": "Is it safe to sail from Ratnagiri on October 25th 2026?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "departure_time": "2026-10-25T06:00:00Z",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Must NOT crash with internal 500 or ConnectorMissingSnapshotError
    assert not any("ConnectorMissingSnapshotError" in w for w in data.get("warnings", []))
    # Must explain coverage limitation (recommendation status should be UNKNOWN or CAUTION, not confident GO)
    assert data["recommendation"]["status"] != "GO" or data["confidence"]["level"] != "HIGH"


# ---------------------------------------------------------------------------
# Test E: A genuinely missing fixture
# ---------------------------------------------------------------------------

def test_e_genuinely_missing_fixture():
    connector = SnapshotConnector()
    with pytest.raises(ConnectorMissingSnapshotError) as exc_info:
        connector._load_snapshot("completely_nonexistent_fixture_9999.json")
    assert "completely_nonexistent_fixture_9999.json" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Test F: A recognized harbor alias
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "alias_input,canonical_output",
    [
        ("Ratnagiri Port", "ratnagiri"),
        ("ratnagiri_port", "ratnagiri"),
        ("Mirkarwada", "ratnagiri"),
        ("mirkarwada port", "ratnagiri"),
        ("रत्नागिरी", "ratnagiri"),
        ("Malvan Port", "malvan"),
        ("मालवण", "malvan"),
    ],
)
def test_f_harbor_alias_normalization(alias_input, canonical_output):
    connector = SnapshotConnector()
    normalized = connector._normalize_harbor(alias_input)
    assert normalized == canonical_output, f"Expected {canonical_output} for {alias_input}, got {normalized}"


# ---------------------------------------------------------------------------
# Test G: Follow-up "Why?" using the returned conversation_id
# ---------------------------------------------------------------------------

def test_g_followup_why_in_same_conversation(client):
    req1 = {
        "message": "Is it safe to go fishing from Ratnagiri tomorrow morning?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    }
    res1 = client.post("/api/v1/chat", json=req1)
    assert res1.status_code == 200
    data1 = res1.json()
    conv_id = data1["conversation_id"]
    assert conv_id is not None

    req2 = {
        "conversation_id": conv_id,
        "message": "Why?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    }
    res2 = client.post("/api/v1/chat", json=req2)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["conversation_id"] == conv_id
    assert not any("ConnectorMissingSnapshotError" in w for w in data2.get("warnings", []))
    assert len(data2.get("trace", [])) > 0


# ---------------------------------------------------------------------------
# Test H: Unsupported geographic coverage does not silently become Ratnagiri
# ---------------------------------------------------------------------------

def test_h_unsupported_geographic_coverage_not_silent(client):
    payload = {
        "message": "Is it safe to sail from Chennai tomorrow morning?",
        "user_context": {
            "origin_harbor": "Chennai",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Verify that if fallback occurred, it is explicitly flagged in warnings
    warnings = data.get("warnings", [])
    has_fallback_warning = any("GEOGRAPHIC-FALLBACK" in w or "SNAPSHOT-GEOGRAPHIC" in w or "Chennai" in w for w in warnings)
    # Or in evidence freshness_flags / source_name
    evidence = data.get("evidence", [])
    has_explicit_tag = any(
        "GEOGRAPHIC" in (e.get("source_name") or "")
        or "FALLBACK" in (e.get("source_name") or "")
        or "GEOGRAPHIC_FALLBACK" in (e.get("quality_flags") or [])
        for e in evidence
    )
    assert has_fallback_warning or has_explicit_tag or len(evidence) == 0, (
        f"Geographic fallback must be explicitly declared, not silent. Warnings: {warnings}"
    )


# ---------------------------------------------------------------------------
# Test I: Path fix works when execution starts from backend directory
# ---------------------------------------------------------------------------

def test_i_path_resolution_from_backend_directory():
    # Simulate cwd at backend/
    backend_dir = Path(__file__).resolve().parent.parent.parent / "backend"
    with patch("pathlib.Path.cwd", return_value=backend_dir):
        connector = SnapshotConnector()
        assert connector._snapshots_dir.exists(), f"Snapshots dir does not exist: {connector._snapshots_dir}"
        assert connector._fixtures_dir.exists(), f"Fixtures dir does not exist: {connector._fixtures_dir}"
        # Test loading Ratnagiri weather snapshot
        weather = connector._load_snapshot("weather_ratnagiri.json")
        assert weather["harbor"] == "Ratnagiri"


# ---------------------------------------------------------------------------
# Test J: Container-equivalent packaged-data lookup
# ---------------------------------------------------------------------------

def test_j_container_equivalent_path_lookup(tmp_path):
    # Simulate container layout: /app/data/source_snapshots
    app_dir = tmp_path / "app"
    data_dir = app_dir / "data" / "source_snapshots"
    data_dir.mkdir(parents=True)
    test_snapshot = data_dir / "weather_ratnagiri.json"
    test_snapshot.write_text('{"metadata": {"snapshot_id": "T1", "provider": "IMD", "source_name": "IMD", "captured_at": "2026-09-06T00:00:00Z", "valid_from": "2026-01-01T00:00:00Z", "valid_to": "2030-01-01T00:00:00Z", "schema_version": "1.0", "checksum": "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce"}, "payload": {"harbor": "Ratnagiri"}}', encoding="utf-8")

    # Verify _resolve_candidate_dir finds it when given custom_path or in search paths
    resolved = _resolve_candidate_dir(str(data_dir), "data/source_snapshots")
    assert resolved.exists()
    assert (resolved / "weather_ratnagiri.json").exists()


# ---------------------------------------------------------------------------
# Test K: Explicit nonexistent snapshot directory raises error without fallback
# ---------------------------------------------------------------------------

def test_k_explicit_nonexistent_snapshot_dir_raises():
    connector = SnapshotConnector(snapshots_path="/nonexistent/custom/path/12345")
    with pytest.raises(ConnectorMissingSnapshotError) as exc_info:
        connector._load_snapshot("weather_ratnagiri.json")
    assert "weather_ratnagiri.json" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Test L: Explicit custom directory missing a file cannot borrow from repository
# ---------------------------------------------------------------------------

def test_l_explicit_custom_dir_missing_file_cannot_borrow(tmp_path):
    custom_dir = tmp_path / "custom_snapshots"
    custom_dir.mkdir()
    # Write only marine snapshot
    (custom_dir / "marine_ratnagiri.json").write_text(
        '{"metadata": {"snapshot_id": "T1", "provider": "INCOIS", "source_name": "INCOIS", "captured_at": "2026-09-06T00:00:00Z", "valid_from": "2026-01-01T00:00:00Z", "valid_to": "2030-01-01T00:00:00Z", "schema_version": "1.0", "checksum": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"}, "payload": {"harbor": "Ratnagiri"}}',
        encoding="utf-8",
    )
    connector = SnapshotConnector(snapshots_path=str(custom_dir))
    # weather_ratnagiri.json exists in repository data/source_snapshots, but connector MUST NOT borrow it
    with pytest.raises(ConnectorMissingSnapshotError) as exc_info:
        connector._load_snapshot("weather_ratnagiri.json")
    assert "weather_ratnagiri.json" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Test M: Unsupported location cannot receive GO or HIGH confidence
# ---------------------------------------------------------------------------

def test_m_unsupported_location_cannot_be_go_or_high(client):
    payload = {
        "message": "Is it safe to go fishing from Chennai tomorrow morning?",
        "user_context": {
            "origin_harbor": "Chennai",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    rec = data.get("recommendation", {})
    conf = data.get("confidence", {})

    # Safety decision MUST NOT be GO and confidence MUST NOT be HIGH on fallback Ratnagiri data
    assert rec.get("status") != "GO", f"Decision status for unsupported harbor must not be GO, got {rec.get('status')}"
    assert conf.get("level") != "HIGH", f"Confidence for unsupported harbor must not be HIGH, got {conf.get('level')}"

    # Verify fallback evidence preserves original simulation identity + fallback marker
    evidence = data.get("evidence", [])
    assert any(
        "GEOGRAPHIC_FALLBACK" in (e.get("source_name") or "")
        or "GEOGRAPHIC_FALLBACK" in (e.get("quality_flags") or [])
        for e in evidence
    )


# ---------------------------------------------------------------------------
# Test N: HazardBulletinPayload declares and preserves freshness_flags
# ---------------------------------------------------------------------------

def test_n_hazard_bulletin_payload_freshness_flags_declared():
    from backend.app.agents.integrations.dev2 import HazardBulletinPayload

    flags = {
        "coverage_status": "GEOGRAPHIC_FALLBACK",
        "warnings": ["Reference only"],
    }
    payload = HazardBulletinPayload(
        harbor="Chennai",
        freshness_flags=flags,
    )
    assert payload.freshness_flags is not None
    assert payload.freshness_flags["coverage_status"] == "GEOGRAPHIC_FALLBACK"
    dumped = payload.model_dump()
    assert "freshness_flags" in dumped
    assert dumped["freshness_flags"]["coverage_status"] == "GEOGRAPHIC_FALLBACK"


# ---------------------------------------------------------------------------
# Test O: Supported-window exercises real snapshot pipeline and deterministic ranking
# ---------------------------------------------------------------------------

def test_o_supported_window_exercises_real_snapshot_pipeline_and_deterministic_ranking(client):
    payload = {
        "message": "Where is the nearest potential fishing zone from Ratnagiri?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "departure_time": "2026-09-30T06:00:00Z",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Grounded against real pfz_advisories.json fixture:
    # Nearest feature is MH-PFZ-51 at distance 13.1 nm, bearing 241.3° (approx 241°)
    # NOT the contract mock (14.2 nm bearing 278.0°) or legacy mock text (12.4 nm bearing 285°)
    answer = data.get("answer", "")
    assert "MH-PFZ-51" in answer or "13.1" in answer, (
        f"Answer must be grounded in real pfz_advisories.json candidate MH-PFZ-51 (13.1 nm). Got: {answer}"
    )
    assert "12.4" not in answer, f"Contract mock value 12.4 nm survived: {answer}"

    # Verify evidence items contain pfz_distance_nm = 13.1 from real ranking engine
    pfz_ev = next((e for e in data.get("evidence", []) if e.get("metric_name") == "pfz_distance_nm"), None)
    assert pfz_ev is not None, "Expected pfz_distance_nm evidence"
    assert abs(float(pfz_ev["metric_value"]) - 13.1) < 0.2, (
        f"Expected real deterministic ranking distance ~13.1 nm, got {pfz_ev['metric_value']}"
    )


# ---------------------------------------------------------------------------
# Test P: PFZ result does not grant navigation clearance
# ---------------------------------------------------------------------------

def test_p_pfz_result_does_not_grant_navigation_clearance(client):
    payload = {
        "message": "Find nearest PFZ coordinates from Ratnagiri",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    rec = data.get("recommendation", {})
    # Must be INFORMATIONAL, not GO
    assert rec.get("status") == "INFORMATIONAL", f"PFZ query must return INFORMATIONAL status, got {rec.get('status')}"
    # Must NOT claim an approved corridor or clearance for passage
    assert "approved corridor" not in rec.get("summary", "").lower()
    assert "approved corridor" not in rec.get("next_action", "").lower()
