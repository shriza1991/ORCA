"""Tests for Backend Rate Limiting Middleware.

Verifies:
1. Requests under limit pass successfully
2. Requests reaching limit return HTTP 429 Too Many Requests
3. Retry-After header is returned
4. Independent clients (different IPs) have separate rate limit buckets
5. Route filtering: /api/v1/chat vs /api/v1/voice/* have independent configured limits
6. Bypass header allows internal/test invocation without limit rejection
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.middleware import RateLimitMiddleware


@pytest.fixture
def rate_limited_app():
    app = FastAPI()
    # Configure tight limits for testing: 3 chat / min, 2 voice / min
    app.add_middleware(
        RateLimitMiddleware,
        chat_limit=3,
        voice_limit=2,
        window_seconds=10,
    )

    @app.post("/api/v1/chat")
    def chat_endpoint():
        return {"status": "ok", "service": "chat"}

    @app.post("/api/v1/voice/transcribe")
    def voice_endpoint():
        return {"status": "ok", "service": "voice"}

    @app.get("/health")
    def health_endpoint():
        return {"status": "healthy"}

    return app


def test_rate_limit_chat_endpoint_under_and_over(rate_limited_app):
    client = TestClient(rate_limited_app)
    headers = {"X-Forwarded-For": "192.168.1.100"}

    # First 3 requests should pass (limit is 3)
    for _ in range(3):
        res = client.post("/api/v1/chat", headers=headers)
        assert res.status_code == 200

    # 4th request should be rejected with 429
    res4 = client.post("/api/v1/chat", headers=headers)
    assert res4.status_code == 429
    assert res4.json()["error"] == "RateLimitExceeded"
    assert "Retry-After" in res4.headers
    assert int(res4.headers["Retry-After"]) >= 1


def test_independent_clients_have_isolated_limits(rate_limited_app):
    client = TestClient(rate_limited_app)
    client_a_headers = {"X-Forwarded-For": "10.0.0.1"}
    client_b_headers = {"X-Forwarded-For": "10.0.0.2"}

    # Client A exhausts its limit (3)
    for _ in range(3):
        res = client.post("/api/v1/chat", headers=client_a_headers)
        assert res.status_code == 200

    assert client.post("/api/v1/chat", headers=client_a_headers).status_code == 429

    # Client B should still be unaffected
    res_b = client.post("/api/v1/chat", headers=client_b_headers)
    assert res_b.status_code == 200


def test_voice_endpoint_has_independent_limit(rate_limited_app):
    client = TestClient(rate_limited_app)
    headers = {"X-Forwarded-For": "10.0.0.5"}

    # Voice limit is 2
    assert client.post("/api/v1/voice/transcribe", headers=headers).status_code == 200
    assert client.post("/api/v1/voice/transcribe", headers=headers).status_code == 200
    assert client.post("/api/v1/voice/transcribe", headers=headers).status_code == 429

    # Chat endpoint should still have its own quota
    assert client.post("/api/v1/chat", headers=headers).status_code == 200


def test_bypass_rate_limit_header(rate_limited_app):
    client = TestClient(rate_limited_app)
    headers = {
        "X-Forwarded-For": "10.0.0.9",
        "x-bypass-rate-limit": "true",
    }

    # Should exceed 3 without any 429 rejection
    for _ in range(6):
        res = client.post("/api/v1/chat", headers=headers)
        assert res.status_code == 200


def test_unrestricted_routes_never_limited(rate_limited_app):
    client = TestClient(rate_limited_app)
    headers = {"X-Forwarded-For": "10.0.0.12"}

    for _ in range(10):
        res = client.get("/health", headers=headers)
        assert res.status_code == 200
