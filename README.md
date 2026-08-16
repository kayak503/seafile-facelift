# Seafile-Facelift

Seafile-Facelift is a modern web interface for an existing Seafile server. It runs as a separate container, stores no files, and uses each person’s normal Seafile account and permissions.

## Install with Docker Compose

You need:

- A working Seafile deployment
- Docker Engine 24+ with Docker Compose v2
- An internal Seafile IP and port reachable from this container
- An existing Caddy reverse proxy that terminates HTTPS

Create a deployment directory and save the following as `compose.yaml`. This example matches the deployment topology in which Seafile is reached through its local IP and Caddy forwards to host port `8082`—no shared Docker network is required.

```yaml
services:
  seafile-facelift:
    image: ghcr.io/kayak503/seafile-facelift:latest
    container_name: seafile-facelift
    restart: unless-stopped

    environment:
      # Internal address used by the app backend to talk to Seafile.
      SEAFILE_URL: http://192.168.1.115:8081
      # Public addresses used by the browser.
      PUBLIC_SEAFILE_URL: https://seafile.grapple.link
      APP_URL: https://drive.grapple.link
      # Generate with: openssl rand -hex 32
      SESSION_SECRET: xxxxx
      APP_NAME: Seafile-Facelift
      APP_ACCENT: '#2563EB'
      ADMIN_URL: https://seafile.grapple.link/profile/

    ports:
      - '8082:3000'
```

Replace `SESSION_SECRET` with the generated value—`xxxxx` is only a placeholder. Adjust the IP or domains if your deployment uses different addresses, then start the app:

```bash
openssl rand -hex 32
docker compose pull
docker compose up -d
docker compose ps
```

Open the configured `APP_URL` and sign in with a normal Seafile username and password. Seafile-Facelift does not require a separate API key.

## Why this Compose file is intentionally simple

This deployment differs from a conventional single-host stack:

- The container serves HTTP only on port `3000`; Caddy owns HTTPS and forwards to host port `8082`.
- `SEAFILE_URL` is the private address the backend can reach. It may use plain HTTP on the trusted local network.
- `PUBLIC_SEAFILE_URL` and `APP_URL` are public HTTPS addresses opened by browsers.
- Seafile-Facelift does not join Seafile’s Docker network because it reaches the existing Seafile service by local IP and port.
- The port mapping is deliberately `8082:3000`, rather than loopback-only, so an existing Caddy instance on another host or network path can reach it. Restrict port `8082` with your host firewall to the Caddy source where appropriate.
- The recommended Compose file avoids optional `read_only`, `tmpfs`, capability, and security-option overrides. Add hardening only after verifying it is compatible with your container platform.

## Use the included Compose file

The repository’s [`docker-compose.yml`](docker-compose.yml) reads deployment values from `.env`:

```bash
cp .env.example .env
openssl rand -hex 32
# Edit .env and paste the generated value into SESSION_SECRET.
docker compose pull
docker compose up -d
```

## Environment reference

| Variable                 | Required     | Purpose                                                                                           |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------- |
| `SEAFILE_URL`            | Yes          | Internal Seafile origin used for backend API traffic, such as `http://192.168.1.115:8081`.        |
| `PUBLIC_SEAFILE_URL`     | Yes          | Public Seafile HTTPS origin opened by the browser.                                                |
| `APP_URL`                | Yes          | Public HTTPS origin for Seafile-Facelift.                                                         |
| `SESSION_SECRET`         | Yes          | Random text with at least 32 characters; generate it with `openssl rand -hex 32`. It is not JSON. |
| `APP_NAME`               | No           | Display name; defaults to `Seafile-Facelift`.                                                     |
| `APP_ACCENT`             | No           | Six-digit hexadecimal accent color.                                                               |
| `ADMIN_URL`              | No           | Destination for “Manage profile on Seafile.”                                                      |
| `SEAFILE_FACELIFT_IMAGE` | Compose only | Image tag or digest; defaults to `ghcr.io/kayak503/seafile-facelift:latest`.                      |
| `SEAFILE_FACELIFT_PORT`  | Compose only | Host port mapped to container port `3000`; defaults to `8082`.                                    |

## Caddy

Seafile-Facelift does not load TLS certificates. Point the existing Caddy proxy at the Docker host’s port `8082`:

```caddyfile
drive.grapple.link {
    reverse_proxy <docker-host-ip>:8082
}
```

Use `127.0.0.1:8082` only when Caddy runs directly on the same host and can reach that loopback address. Preserve Caddy’s normal forwarded host, scheme, and client-address headers.

## Releases and upgrades

Images are published only when an exact numeric version tag such as `1.0.0` is pushed. Commits to `main` do not publish an image and do not change `latest`; `latest` always means the newest tagged release.

The release workflow bakes that tag into the image as `APP_VERSION` and as the OCI image-version label. The same value appears beside “Open administration” in the application sidebar, so the running release can be identified without checking the container host.

Upgrade with:

```bash
docker compose pull
docker compose up -d
```

For reproducible production deployments, set `SEAFILE_FACELIFT_IMAGE` to a version tag or image digest. Roll back by restoring the previous tag or digest and recreating the container.

## Health and troubleshooting

Readiness is available at `GET /api/health`. It reports application readiness and Seafile connectivity without exposing credentials or private server URLs.

If required environment variables are missing or invalid, Seafile-Facelift shows a read-only deployment diagnostics page. It checks each value separately and distinguishes URL-format problems, an unreachable Seafile server, and an invalid `SESSION_SECRET`.

```bash
docker compose logs --tail=200 seafile-facelift
docker compose config
```

Developer setup, architecture, API notes, tests, and contribution guidance are in [`development-information/README.md`](development-information/README.md).
