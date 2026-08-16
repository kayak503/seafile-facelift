# Seafile-Facelift development information

This document is the developer and maintainer reference. The root [`README.md`](../README.md) intentionally contains deployment instructions only.

## Project purpose

Seafile-Facelift is a Next.js Backend-for-Frontend for Seafile. The browser talks only to Seafile-Facelift routes. Seafile-Facelift authenticates with Seafile, keeps the resulting account token on the server, and forwards authorized file operations to Seafile.

The application does not mount or duplicate Seafile storage. Seafile remains the source of truth for libraries, files, permissions, stars, trash, quotas, and share links.

## Architecture

```text
Browser
  ├─ React workspace and public share viewer
  └─ /api/* requests with an HttpOnly Seafile-Facelift session
          │
          ▼
Next.js Backend-for-Frontend
  ├─ validates paths, names, origins, and rate limits
  ├─ keeps Seafile tokens in process memory
  ├─ streams uploads, previews, and downloads
  └─ SeafileAdapter normalizes upstream API differences
          │
          ▼
Seafile Web API and file server
```

Key modules:

- `components/drive-shell.tsx` — authenticated file workspace and interaction state
- `components/public-share-view.tsx` — recipient-facing Seafile-Facelift share page
- `lib/seafile/client.ts` — all Seafile API communication and response normalization
- `lib/session.ts` — encrypted session cookie plus server-side token store
- `lib/public-share.ts` — encrypted, tamper-evident public share payloads
- `app/api/*` — validation and transport boundary between the browser and Seafile
- `tests/e2e/fixtures/fake-seafile.mjs` — disposable Seafile-compatible test service

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- Playwright Chromium (`npx playwright install chromium`)
- Docker 24+ for container validation

## Local setup

```bash
npm ci
cp .env.example .env.local
```

For local development, update `.env.local` to use reachable URLs:

```dotenv
SEAFILE_URL=http://192.168.1.115:8081
PUBLIC_SEAFILE_URL=http://192.168.1.115:8081
APP_URL=http://localhost:3000
SESSION_SECRET=a-local-secret-with-at-least-32-characters
APP_NAME=Seafile-Facelift
APP_ACCENT=#2563EB
ADMIN_URL=http://192.168.1.115:8081/profile/
```

Start the development server:

```bash
npm run dev
```

Configuration is intentionally environment-only. Never add a browser form that stores the Seafile URL or session secret.

## Environment reference

| Variable                 | Required     | Purpose                                                                                                   |
| ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------- |
| `SEAFILE_URL`            | Yes          | Private Seafile origin used by the server.                                                                |
| `PUBLIC_SEAFILE_URL`     | Yes          | Public Seahub origin used for user-facing links.                                                          |
| `APP_URL`                | Yes          | Canonical Seafile-Facelift origin used for links, secure-cookie behavior, and mutation-origin validation. |
| `SESSION_SECRET`         | Yes          | At least 32 characters; derives AES-GCM and HMAC keys.                                                    |
| `APP_NAME`               | No           | Product name shown in the interface.                                                                      |
| `APP_ACCENT`             | No           | Six-digit hexadecimal brand color.                                                                        |
| `ADMIN_URL`              | No           | Profile or administration destination.                                                                    |
| `SEAFILE_FACELIFT_IMAGE` | Compose only | Container image tag or digest.                                                                            |
| `SEAFILE_FACELIFT_PORT`  | Compose only | Host port mapped to container port 3000.                                                                  |

## Commands

```bash
npm run dev           # Development server
npm run format        # Format source and documentation
npm run format:check  # Verify formatting without changing files
npm run lint          # ESLint and Next.js rules
npm test              # Unit and adapter tests
npm run test:e2e      # Browser tests against the fake Seafile service
npm run test:e2e:ui   # Interactive Playwright runner
npm run build         # Optimized standalone production build
npm run check         # Formatting, lint, unit tests, and production build
```

## API boundary

Browser routes are not a public compatibility API. They are documented here so maintainers know where behavior belongs.

| Route                       | Methods                 | Responsibility                                                            |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `/api/auth/login`           | `POST`                  | Authenticate with Seafile and create an opaque Seafile-Facelift session.  |
| `/api/auth/logout`          | `POST`                  | Destroy the local session and cookie.                                     |
| `/api/drive`                | `GET`, `POST`           | List libraries/directories and perform validated file mutations.          |
| `/api/item-action`          | `GET`, `POST`, `DELETE` | Star items and create, list, or revoke external shares.                   |
| `/api/search`               | `GET`                   | Apply advanced filters to normalized Seafile search results.              |
| `/api/sections`             | `GET`                   | Recent, Starred, Shared, and Trash data.                                  |
| `/api/upload`               | `POST`                  | Stream multipart uploads to Seafile.                                      |
| `/api/download`             | `GET`                   | Stream authorized files with range support.                               |
| `/api/preview`              | `GET`                   | Inline variant of the authenticated download stream.                      |
| `/api/thumbnail`            | `GET`                   | Bounded thumbnail proxy with private caching.                             |
| `/api/public-share/unlock`  | `POST`                  | Validate a Seafile-Facelift share password and issue a scoped cookie.     |
| `/api/public-share/content` | `GET`                   | Stream public-share content while enforcing expiry and download settings. |
| `/api/account`              | `GET`                   | Normalized storage usage.                                                 |
| `/api/health`               | `GET`                   | Non-sensitive readiness and upstream connectivity.                        |

Route handlers should stay thin: validate input, require the correct session/origin, call a library module, and translate the result to HTTP. Seafile-specific response handling belongs in `SeafileAdapter`, not components or route handlers.

## SeafileAdapter API

`SeafileAdapter` owns authentication, libraries, directory listings, mutations, search fallbacks, stars, shares, quota, thumbnails, transfer URLs, and health checks.

Design rules:

1. Accept normalized application inputs and return types from `lib/seafile/types.ts`.
2. Keep Seafile endpoint and response-shape differences inside the adapter.
3. Throw `AppError` with a stable code and safe user-facing message.
4. Add a mocked adapter test for each new endpoint or fallback.
5. Never log tokens, passwords, cookies, share payloads, or private URLs.

Community Edition does not always expose the same search endpoints as Pro. Search therefore tries native cross-library search and then falls back to bounded recursive listings or directory traversal.

## Sessions and public shares

Session cookies contain only an encrypted opaque session ID, username, and issue time. The Seafile token is stored in a process-local map and is removed on logout or expiry.

Consequences:

- Container restarts sign users out.
- Horizontal replicas require sticky sessions unless the in-memory store is replaced with a shared encrypted store.
- `SESSION_SECRET` changes invalidate sessions and public Seafile-Facelift share payloads.

Public share URLs contain an AES-256-GCM encrypted payload. Passwords are represented by an HMAC digest, never plaintext. The public content route validates tampering, expiry, password state, and the download permission before proxying content.

## Testing

### Unit and adapter tests

```bash
npm test
```

These tests mock upstream responses and cover normalization, authorization behavior, mutations, search fallbacks, share links, storage, and public-share cryptography.

### End-to-end tests

```bash
npm run test:e2e
```

Playwright starts two disposable processes:

1. A fake Seafile API on port `4100`.
2. Seafile-Facelift on port `3200`, configured to use that fake service.

The suite covers login failures and success, logout, quotas, list/grid behavior, selection, view persistence, themes, extension-safe rename, Enter/Escape/blur semantics, folder creation, bulk actions, partial and extension search, advanced filters, stars, share creation, external-share management, revocation, and mobile navigation.

Tests must never use a real Seafile account. Extend the fake service when a new upstream workflow is introduced.

## Code and documentation conventions

- Run Prettier; do not hand-align syntax.
- Prefer descriptive names and small helpers over comments that repeat the code.
- Add comments where a security constraint, browser limitation, upstream compatibility fallback, or non-obvious UX decision would otherwise be lost.
- Add JSDoc to exported modules, classes, and functions when their contract is not obvious from types alone.
- Document every environment variable in `.env.example`, Compose, and this file.
- Keep UI copy specific and actionable; do not report unsupported operations as permission failures.
- Use semantic controls, visible focus states, keyboard equivalents, and explicit loading/error/empty states.
- Keep file extensions immutable during inline rename and reserve row/tile clicks for opening; selection belongs to dedicated checkboxes.

## Design principles

- Familiar file-manager patterns over clever interactions.
- One primary action per surface and progressive disclosure for advanced controls.
- Selection and navigation must never be ambiguous.
- Optimistic feedback only when the server has accepted the action.
- Loading, empty, error, read-only, and unsupported states must be visually distinct.
- Light and dark themes share the same information hierarchy and accessibility requirements.
- Preferences such as theme and list/grid mode persist locally.
- Responsive layouts preserve functionality rather than merely hiding it.

## Production build and container

```bash
npm run check
docker build --pull -t seafile-facelift:local .
docker run --rm -p 3000:3000 \
  -e SEAFILE_URL=http://host.docker.internal:8081 \
  -e PUBLIC_SEAFILE_URL=http://localhost:8081 \
  -e APP_URL=http://localhost:3000 \
  -e SESSION_SECRET=a-production-length-secret-of-at-least-32-characters \
  seafile-facelift:local
```

The final image runs as an unprivileged user, uses the Next.js standalone output, includes a health check, and does not require a writable application filesystem. In production it serves HTTP behind Caddy through host port `8082`; Caddy owns TLS. Seafile is reached through the internal IP in `SEAFILE_URL`, so the containers do not require a shared Docker network. `APP_VERSION` is image-owned metadata: release builds set it from the numeric Git tag, while an ordinary local image reports `development`.

## Continuous integration and image publishing

`.github/workflows/ci.yml` runs formatting, lint, unit tests, the production build, and all browser journeys for pull requests and changes to `main`. Failed browser runs retain screenshots, traces, and video for seven days.

Workflow actions use Node 24-native action releases. This action runtime is separate from the Node 22 LTS runtime used to install and test the application. Do not enable `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`; upgrade an action when GitHub reports that it still depends on Node 20.

`.github/workflows/container.yml` publishes signed-provenance, SBOM-enabled `linux/amd64` and `linux/arm64` images to GitHub Container Registry only when a numeric semantic-version tag is pushed. Branch pushes and manual workflow runs cannot publish an image. A tag such as `1.2.3` publishes both `1.2.3` and `latest`:

```bash
git tag 1.2.3
git push origin 1.2.3
```

Tags must use the exact `MAJOR.MINOR.PATCH` form without a `v` prefix. The repository package must be public for unauthenticated pulls shown in the root README.

## Release checklist

1. `npm ci`
2. `npm run format:check`
3. `npm run lint`
4. `npm test`
5. `npm run test:e2e`
6. `npm run build`
7. `docker build --pull -t seafile-facelift:<version> .`
8. Scan the image and production dependencies.
9. Create and push a `MAJOR.MINOR.PATCH` Git tag; confirm the container workflow publishes that version and its immutable digest.
10. Deploy to staging and verify login, file preview, upload, rename, search, share, logout, and `/api/health`.
