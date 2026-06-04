# Uses the official Playwright image — Chromium + all deps preinstalled
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

# Cloud hosts inject a PORT env var; default to 5000 locally
ENV PORT=5000
EXPOSE 5000

# Single worker, threaded — the solver runs in background threads per job
CMD gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 300 app:app
