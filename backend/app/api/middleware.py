"""FastAPI Middlewares.

Owned by Dev 2 (Backend Platform).
Implements request IDs, size limits, sliding-window rate limiting, and observability.
"""

import asyncio
import logging
import math
import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Injects a unique request ID into every request state and response headers."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        request.state.request_started_at = time.perf_counter()
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class UnhandledExceptionMiddleware(BaseHTTPMiddleware):
    """Convert uncaught request failures into safe JSON responses."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            request_id = getattr(request.state, "request_id", "unknown")
            started_at = getattr(request.state, "request_started_at", None)
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2) if started_at else None
            logger.error(
                "Unhandled request failure",
                extra={
                    "request_id": request_id,
                    "route": request.url.path,
                    "method": request.method,
                    "error_type": type(exc).__name__,
                    "safe_message": "The request could not be completed.",
                    "duration_ms": duration_ms,
                    "data_mode": settings.DATA_MODE,
                },
            )
            return JSONResponse(
                status_code=500,
                content={"error": {"code": "INTERNAL_ERROR", "message": "ORCA could not complete this request. Please retry.", "request_id": request_id}},
            )


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Limits incoming request payload size."""

    def __init__(
        self,
        app,
        max_upload_size: int = 1048576,
        max_voice_upload_size: int = 26214400,  # 25 MB for audio recordings
    ) -> None:
        super().__init__(app)
        self.max_upload_size = max_upload_size
        self.max_voice_upload_size = max_voice_upload_size

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            if content_length:
                limit = (
                    self.max_voice_upload_size
                    if "/voice/" in request.url.path
                    else 6 * 1024 * 1024 if request.url.path == "/api/v1/community/media"
                    else self.max_upload_size
                )
                if int(content_length) > limit:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "error": "PayloadTooLarge",
                            "message": f"Request body exceeds {limit} bytes limit.",
                        },
                    )
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding window rate limiter for critical endpoints.
    
    Protects /api/v1/chat and /api/v1/voice/* against denial-of-service,
    excessive upstream provider consumption, and quota burnout.
    """

    def __init__(
        self,
        app,
        chat_limit: int = 60,
        voice_limit: int = 20,
        window_seconds: int = 60,
    ) -> None:
        super().__init__(app)
        self.chat_limit = chat_limit
        self.voice_limit = voice_limit
        self.window_seconds = window_seconds
        # Dict mapping key -> list of float timestamps
        self._history: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    def _get_client_key(self, request: Request, route_type: str) -> str:
        # Use X-Forwarded-For if available, otherwise client host
        forwarded = request.headers.get("x-forwarded-for")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        return f"{route_type}:{client_ip}"

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        route_type = None
        limit = 0

        if path.startswith("/api/v1/community") and request.method == "POST":
            route_type = "community"
            limit = 30
        elif path.startswith("/api/v1/chat"):
            route_type = "chat"
            limit = self.chat_limit
        elif path.startswith("/api/v1/voice"):
            route_type = "voice"
            limit = self.voice_limit

        # If not a rate-limited route or limit is 0 (disabled), bypass
        if not route_type or limit <= 0:
            return await call_next(request)

        # Allow tests to bypass if explicitly requested via header
        if request.headers.get("x-bypass-rate-limit") == "true":
            return await call_next(request)

        now = time.time()
        client_key = self._get_client_key(request, route_type)

        async with self._lock:
            timestamps = self._history.get(client_key, [])
            # Prune timestamps older than window
            cutoff = now - self.window_seconds
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= limit:
                retry_after = int(math.ceil(valid_timestamps[0] + self.window_seconds - now))
                retry_after = max(1, retry_after)
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "RateLimitExceeded",
                        "message": f"Rate limit of {limit} requests per {self.window_seconds}s exceeded for {route_type}.",
                        "retry_after_seconds": retry_after,
                    },
                    headers={"Retry-After": str(retry_after)},
                )

            valid_timestamps.append(now)
            self._history[client_key] = valid_timestamps

        return await call_next(request)


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Structured latency tracking and request metrics propagation."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start_time = time.perf_counter()
        request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID", "unknown")

        response = await call_next(request)

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.2f}"

        # Structured request summary log without leaking secrets or payload
        logger.info(
            "HTTP request completed",
            extra={
                "method": request.method,
                "route": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(elapsed_ms, 2),
                "request_id": request_id,
                "data_mode": settings.DATA_MODE,
            },
        )

        return response
