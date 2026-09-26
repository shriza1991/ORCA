from fastapi.testclient import TestClient

from backend.app.domain import situation
from backend.app.main import create_app


def test_situation_provider_failure_returns_explicit_unknown(monkeypatch):
    def fail_situation(*args, **kwargs):
        raise RuntimeError("provider credentials must not be exposed")

    monkeypatch.setattr(situation, "evaluate_sector_situation", fail_situation)
    app = create_app()

    with TestClient(app) as client:
        response = client.get(
            "/api/v1/demo/sectors/sector-ratnagiri/situation",
            headers={"Origin": "https://samudra-qxx1.vercel.app"},
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://samudra-qxx1.vercel.app"
    payload = response.json()
    assert payload["situation_status"] == "UNKNOWN"
    assert payload["fleet_count"] is None
    assert payload["active_hazard_count"] is None
    assert payload["data_mode"] == "UNAVAILABLE"
    assert "SITUATION_UNAVAILABLE" in payload["warnings"]
    assert "provider credentials" not in response.text


def test_unhandled_failure_has_safe_json_and_cors_headers():
    app = create_app()

    def fail():
        raise RuntimeError("database password must not be exposed")

    app.add_api_route("/test/unhandled", fail)
    with TestClient(app) as client:
        response = client.get(
            "/test/unhandled",
            headers={"Origin": "https://samudra-qxx1.vercel.app"},
        )

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "https://samudra-qxx1.vercel.app"
    assert response.headers.get("x-request-id")
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "database password" not in response.text
