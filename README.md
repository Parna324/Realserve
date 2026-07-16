# CollabCode

A polished real-time collaborative code editor: shared rooms, JWT auth, Monaco, Yjs CRDT updates, live presence, Redis fan-out, debounced PostgreSQL persistence, and Docker deployment scaffolding.

## Architecture

- `frontend`: Next.js, React, Tailwind CSS, shadcn-style UI primitives, Framer Motion, lucide-react, Monaco Editor.
- `backend`: Express, Socket.IO, PostgreSQL, Redis, JWT authentication.
- `Yjs`: conflict-free document model. Concurrent edits merge as CRDT updates instead of overwriting each other.
- `Redis`: WebSocket fan-out across multiple backend instances plus short-lived live document cache.
- `PostgreSQL`: durable users, rooms, membership roles, document metadata, and debounced snapshots.

## Features

- Signup/login with JWT.
- Protected room dashboard.
- Create and join shared rooms by link or room ID.
- Monaco editor bound to a Yjs document.
- Live document updates and awareness updates over Socket.IO.
- Roles: owner/editor can edit; viewer is read-only.
- Owner-only rename/delete API endpoints.
- Debounced document persistence; final save when the last user leaves.
- Local multi-backend simulation behind nginx.

## Local Development

Install dependencies:

```bash
npm install
```

Create `backend/.env` from `backend/.env.example`, then start Postgres and Redis locally or through Docker.

Apply the database schema:

```bash
npm run db:migrate
```

Run the apps:

```bash
npm run dev:backend
npm run dev:frontend
```

Open `http://localhost:3000`.

## Docker Simulation

```bash
docker compose up --build
docker compose run --rm backend-1 npm run db:migrate -w backend
```

The compose stack runs two backend instances behind nginx on `http://localhost:4000`, proving that Redis Pub/Sub can sync users even when they land on different WebSocket servers.

## Offline-Friendly Local Infra

If Docker cannot reach Docker Hub, but you already have `postgres:15-alpine` and `redis:7-alpine` locally:

```bash
docker compose -f docker-compose.infra.yml up -d
```

Use these backend env values:

```bash
DATABASE_URL=postgres://collab:collab@localhost:55432/collab_code
REDIS_URL=redis://localhost:56379
```

Then run the app directly with npm:

```bash
npm run db:migrate
npm run dev:backend
npm run dev:frontend
```

## Important Tradeoffs

The backend does not write to Postgres on every keystroke. It keeps the active Yjs document in memory, broadcasts small CRDT updates immediately, and saves snapshots every `SNAPSHOT_INTERVAL_MS` or when the final user leaves. This keeps editing responsive, but a crash can lose edits made after the most recent snapshot.

## Common Edge Cases

- Redis down: the app still works in single-instance mode, but cross-instance collaboration is not guaranteed.
- User disconnects mid-edit: their last sent Yjs update remains merged; presence disappears on disconnect.
- Viewer tries to edit: frontend sets Monaco read-only, and backend rejects viewer Yjs updates.
- JWT secret changes: existing tokens become invalid.

Deployment details live in [docs/deployment.md](docs/deployment.md).
