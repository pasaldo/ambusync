# Digests verified against the publishers' registries on 2026-11-17.
FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS frontend
WORKDIR /frontend
RUN npm install --global npm@11.19.0
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.11.26@sha256:3d868e555f8f1dbc324afa005066cd11e1053fc4743b9808ca8025283e65efa5 AS uv
FROM axllent/mailpit:v1.34.0@sha256:5040a9c533087d25dcb8f2ac748f45c9be5f7bc1d9fe5b860afb9597a2471d57 AS mailpit
FROM caddy:2.11.9@sha256:fc9cbc100585871d18d4e451cca7021785c90a7006087427ae5ceb3e4efe6424 AS mailbox-proxy
FROM python:3.14.10-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b AS dependencies
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
RUN uv sync --locked --no-dev --no-install-project

FROM python:3.14.10-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b AS runtime
RUN groupadd --gid 10001 ambusync && useradd --uid 10001 --gid 10001 --no-create-home ambusync \
    && python -m pip uninstall --yes pip
WORKDIR /app
COPY --from=dependencies /app/.venv /app/.venv
COPY --from=mailpit /mailpit /usr/local/bin/mailpit
COPY --from=mailbox-proxy /usr/bin/caddy /usr/local/bin/caddy
COPY ops/deploy/mailbox/Caddyfile /app/mailbox/Caddyfile
COPY backend/ /app/
COPY --from=frontend /frontend/dist /app/frontend-dist
ARG AMBUSYNC_BUILD_SHA
RUN python -c "import os,re,pathlib; s=os.environ['AMBUSYNC_BUILD_SHA']; assert re.fullmatch('[0-9a-f]{40}',s); pathlib.Path('/app/build-sha').write_text(s)"
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.deployment_settings \
    AMBUSYNC_LOAD_DOTENV=false AMBUSYNC_FRONTEND_ROOT=/app/frontend-dist
USER 10001:10001
EXPOSE 10000
ENTRYPOINT ["python", "-m", "config.deployment_start"]
