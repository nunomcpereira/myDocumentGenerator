FROM python:3.12-slim

ARG TARGETARCH

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    libreoffice \
    tar \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$arch" in \
        arm64|aarch64) docker_arch="aarch64"; plugin_arch="arm64" ;; \
        amd64|x86_64) docker_arch="x86_64"; plugin_arch="amd64" ;; \
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/docker-29.2.1.tgz" -o /tmp/docker.tgz; \
    tar -xzf /tmp/docker.tgz -C /tmp; \
    install -m 0755 /tmp/docker/docker /usr/local/bin/docker; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL "https://github.com/docker/mcp-gateway/releases/download/v0.40.2/docker-mcp-linux-${plugin_arch}.tar.gz" -o /tmp/docker-mcp.tgz; \
    tar -xzf /tmp/docker-mcp.tgz -C /tmp; \
    install -m 0755 /tmp/docker-mcp /usr/local/lib/docker/cli-plugins/docker-mcp; \
    rm -rf /tmp/docker /tmp/docker.tgz /tmp/docker-mcp /tmp/docker-mcp.tgz

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY .env ./.env

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]