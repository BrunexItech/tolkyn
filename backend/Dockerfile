# --- builder: compile wheels once, keep build tools out of the final image ---
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# ------------------------------- runtime -------------------------------
FROM python:3.11-slim AS runtime

# libpq5 is the psycopg2 runtime lib; curl backs the container healthcheck;
# ffmpeg composites the brand-logo watermark onto generated videos.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 appuser
WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

COPY . .
RUN mkdir -p /app/media && chown -R appuser:appuser /app

USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Workers default to 2 — tune via WEB_CONCURRENCY for the box this actually
# runs on (rule of thumb: (2 x CPU cores) + 1). Each worker holds its own DB
# pool (DB_POOL_SIZE + DB_MAX_OVERFLOW) — raising worker count raises real
# Postgres connections proportionally; see DEPLOYMENT.md.
CMD ["sh", "-c", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers ${WEB_CONCURRENCY:-2} --bind 0.0.0.0:8000 --timeout 60 --graceful-timeout 30 --access-logfile - --error-logfile -"]
