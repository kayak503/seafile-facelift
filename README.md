# Grapple Drive

Grapple Drive is a modern web interface for an existing Seafile server. It runs as a separate container, stores no files, and uses each person’s normal Seafile account and permissions.

## Install with Docker Compose

Prerequisites:

- A working Seafile deployment
- Docker Engine 24+ with Docker Compose v2
- A Docker network shared with the Seafile container
- HTTPS through your existing reverse proxy for production use

Create a deployment directory and save this as `compose.yaml`:

```yaml
services:
  grapple-drive:
    image: ghcr.io/kayak503/seafile-facelift:latest
    container_name: grapple-drive
    restart: unless-stopped
    environment:
      # Private URL reachable from this container.
      SEAFILE_URL: http://seafile
      # Public URLs opened by users.
      PUBLIC_SEAFILE_URL: https://files.example.com
      APP_URL: https://drive.example.com
      # Generate with: openssl rand -hex 32
      SESSION_SECRET: replace-with-a-random-secret
      APP_NAME: Grapple Drive
      APP_ACCENT: '#2563EB'
      ADMIN_URL: https://files.example.com/profile/
    ports:
      - '8082:3000'
    networks:
      - seafile
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

networks:
  seafile:
    external: true
```

Replace the URLs and secret, then pull and start the application:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Open the configured `APP_URL` and sign in with a Seafile username and password. Grapple Drive does not require a separate API key.

## Use the included Compose file

The repository’s [`docker-compose.yml`](docker-compose.yml) reads deployment values from `.env`:

```bash
cp .env.example .env
openssl rand -hex 32
# Edit .env and paste the generated value into SESSION_SECRET.
docker compose pull
docker compose up -d
```

The defaults publish Grapple Drive on port `8082` and join an external Docker network named `seafile`. Both can be changed in `.env`.

## Upgrade or roll back

Pull and recreate the container to upgrade:

```bash
docker compose pull
docker compose up -d
```

For reproducible production deployments, pin `GRAPPLE_IMAGE` to a version tag or image digest instead of `latest`. To roll back, restore the previous tag and run `docker compose up -d` again.

## Reverse proxy and health check

Proxy the public HTTPS hostname to container port `3000` (or host port `8082`). Preserve the original `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and client IP headers.

Readiness is available at:

```text
GET /api/health
```

The endpoint reports Grapple readiness and Seafile connectivity without exposing credentials or private server URLs.

## Configuration problems

If required environment variables are missing, Grapple Drive shows a deployment-instructions page instead of accepting configuration through the browser. Check container logs and configuration with:

```bash
docker compose logs --tail=200 grapple-drive
docker compose config
```

Developer setup, architecture, API notes, tests, and contribution guidance are in [`development-information/README.md`](development-information/README.md).
