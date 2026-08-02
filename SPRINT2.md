# Project Alpha — Sprint 2

Backend foundation: Express + PostgreSQL + Prisma + JWT auth.

## What shipped

- PostgreSQL via Prisma (`provider = "postgresql"`)
- `User` model as auth source of truth
- JWT auth (httpOnly cookie + Bearer token)
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `GET  /api/auth/protected` (middleware proof)
- `GET  /api/health`
- `GET  /api/ready` (DB ping)
- Environment configuration (`.env.example`)
- Frontend login/signup already wired to these APIs

## Local setup

### Option A — Embedded PostgreSQL (no Docker required)

```bash
npm install
npm run db:local
```

In a second terminal:

```bash
# .env should use:
# DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/project_alpha?schema=public"
npm run db:migrate:deploy
npm run dev
```

### Option B — Docker Compose

```bash
docker compose up -d
npm install
npm run db:migrate:deploy
npm run dev
```

### Option C — System PostgreSQL

1. Install PostgreSQL 17
2. Create database `project_alpha`
3. Set `DATABASE_URL` in `.env` to your connection string
4. Run `npm run db:migrate:deploy` then `npm run dev`

## Test URLs

- Health: http://localhost:3000/api/health
- Ready: http://localhost:3000/api/ready
- Signup: http://localhost:3000/pages/signup.html
- Login: http://localhost:3000/pages/login.html

## Notes

- Landing page unchanged
- Dashboard/product UI left intact; auth pages talk to the real backend
- No mock users; create an account via signup
