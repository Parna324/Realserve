# Deployment Notes

## Local Multi-Instance Simulation

Run Postgres, Redis, two backend instances, nginx, and the frontend:

```bash
docker compose up --build
```

Apply the schema once:

```bash
docker compose run --rm backend-1 npm run db:migrate -w backend
```

Open `http://localhost:3000`, create two users in two browser profiles, and join the same room. nginx balances users across `backend-1` and `backend-2`; Redis Pub/Sub carries Yjs and awareness updates between instances.

## Why Redis Is Needed

A single WebSocket server only knows about sockets connected to that exact process. If one user lands on instance A and another lands on instance B, local in-memory broadcasts do not cross the process boundary. Redis Pub/Sub gives the instances a shared event lane so document updates and presence changes reach every connected user.

## Persistence Strategy

The backend does not write to PostgreSQL on every keystroke. Each room keeps a live Yjs document in memory, broadcasts small CRDT updates immediately, and debounces snapshots into PostgreSQL with `SNAPSHOT_INTERVAL_MS`. Redis also receives the latest encoded Yjs state with a short TTL.

Tradeoffs:

- Fast typing stays fast because Postgres is not in the hot path.
- A sudden process crash can lose edits made after the last debounce window.
- Shorter debounce windows reduce potential loss but increase write pressure.
- The final user leaving triggers an immediate best-effort save.

## AWS ECS Outline

1. Push `frontend` and `backend` images to ECR.
2. Create RDS PostgreSQL and ElastiCache Redis in the same VPC.
3. Store `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` in AWS Secrets Manager.
4. Run backend as an ECS service behind an Application Load Balancer. Enable sticky sessions only if desired; Redis Pub/Sub means correctness does not depend on stickiness.
5. Run frontend as a separate ECS service or deploy it to Amplify/Vercel with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` pointing at the backend ALB.
6. Run database migrations as a one-off ECS task during deploy.
