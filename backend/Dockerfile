# =============================================================================
# ORCA Backend Dockerfile
# Owned by Dev 2 (Backend Platform)
#
# Multi-stage build:
#   Stage 1 (builder) — install Python dependencies
#   Stage 2 (runtime) — slim production image
#
# Usage:
#   docker build -t orca-backend -f backend/Dockerfile .
#   docker run --env-file .env -p 8000:8000 orca-backend
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder — install deps in a virtual env
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps required for geopandas, shapely, psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages into a virtual env for clean layer separation
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: Runtime — slim final image
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

LABEL org.opencontainers.image.title="ORCA Backend"
LABEL org.opencontainers.image.description="ORCA — Marine EcOsystem Reasoning with Collaborative Agents"
LABEL org.opencontainers.image.source="https://github.com/shriza1991/ORCA"

# Runtime system libraries for PostGIS/Shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libgdal36 \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Copy backend source and repository reference/fixture data
COPY backend /app
COPY data /app/data

# Ensure /data symlink points to /app/data for absolute container path resolution
RUN ln -s /app/data /data 2>/dev/null || true

# Create symlink so 'from backend.app...' and 'from app...' both resolve cleanly
RUN ln -s /app /app/backend 2>/dev/null || true
ENV PYTHONPATH="/app:${PYTHONPATH}"

# Configure executable entrypoint script
RUN chmod +x /app/scripts/entrypoint.sh 2>/dev/null || true

# Non-root user for security
RUN useradd -m -u 1001 orca && chown -R orca:orca /app
USER orca

# Default environment (overridden at runtime via --env-file or -e flags)
ENV APP_ENV=production \
    DEBUG=false \
    DATA_MODE=HYBRID \
    BACKEND_HOST=0.0.0.0 \
    BACKEND_PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/v1/health', timeout=5)"

ENTRYPOINT ["/bin/sh", "/app/scripts/entrypoint.sh"]
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --log-level info"]
