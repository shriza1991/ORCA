"""Deployment regressions for the exact ORCA browser origin."""
import pytest
from fastapi.testclient import TestClient
from backend.app.core.config import Settings, settings
from backend.app.main import create_app

ORIGIN = "https://orca-qxx1.vercel.app"

@pytest.mark.parametrize("raw", [
    "http://localhost:5173",  # stale local-only override
    '["http://localhost:5173", "https://orca-qxx1.vercel.app/"]',
    " http://localhost:5173/, https://orca-qxx1.vercel.app/ ",
])
def test_exact_prototype_origin_survives_override(raw):
    config = Settings(_env_file=None, DEBUG=False, CORS_ORIGINS=raw)
    assert config.cors_origins_list.count(ORIGIN) == 1
    assert "http://localhost:5173" in config.cors_origins_list
    assert "*" not in config.cors_origins_list

@pytest.mark.parametrize("raw", ["*", "https://*.vercel.app", "https://example.com/path", "https://user:pass@example.com"])
def test_cors_rejects_broad_or_invalid_origins(raw):
    with pytest.raises(ValueError):
        Settings(_env_file=None, DEBUG=False, CORS_ORIGINS=raw).cors_origins_list


def test_different_deployment_can_explicitly_opt_out():
    config = Settings(_env_file=None, DEBUG=False, CORS_ORIGINS="https://example.com", FRONTEND_ORIGIN="")
    assert config.cors_origins_list == ["https://example.com"]


def test_preflight_and_error_responses_for_deployed_browser(monkeypatch):
    monkeypatch.setattr(settings, "CORS_ORIGINS", "http://localhost:5173")
    monkeypatch.setattr(settings, "FRONTEND_ORIGIN", ORIGIN)
    app = create_app()
    client = TestClient(app)
    for path, method in [
        ("/api/v1/health", "GET"),
        ("/api/v1/layers/base", "GET"),
        ("/api/v1/demo/vessels", "GET"),
        ("/api/v1/spatial/query", "POST"),
    ]:
        response = client.options(path, headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "content-type,x-request-id",
        })
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == ORIGIN
    rejected = client.options("/api/v1/health", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET",
    })
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers
    # A normal response and a validation failure must both remain browser-readable.
    for response in [client.get("/", headers={"Origin": ORIGIN}),
                     client.post("/api/v1/spatial/query", json={}, headers={"Origin": ORIGIN})]:
        assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.status_code == 422
