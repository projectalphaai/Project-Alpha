# Project Alpha — Sprint 1

Real backend for auth, Meta OAuth (Instagram + Facebook), OpenAI generation, and scheduled posts.

## Stack

- Express API (`server/src`)
- Prisma + SQLite database (`server/prisma`)
- Cookie JWT sessions
- Meta Graph API OAuth
- OpenAI Chat Completions API
- Existing HTML/CSS UI (unchanged layout)

## Setup

1. Copy environment file:

```bash
cp .env.example .env
```

2. Fill required values in `.env`:

- `JWT_SECRET` — 32+ character secret
- `TOKEN_ENCRYPTION_KEY` — 32+ character secret (64 hex chars recommended)
- `DATABASE_URL` — default `file:./dev.db`
- `META_APP_ID` / `META_APP_SECRET` — from [Meta for Developers](https://developers.facebook.com/)
- `META_OAUTH_REDIRECT_URI` — must match the Valid OAuth Redirect URI in your Meta app (`http://localhost:3000/api/oauth/meta/callback` for local)
- `OPENAI_API_KEY` — from OpenAI

3. Install and migrate:

```bash
npm install
npm run db:push
npm run dev
```

4. Open `http://localhost:3000/pages/signup.html`, create an account, then use the dashboard.

## Meta app checklist

- Add Facebook Login product
- Add Instagram Graph API product
- Set Valid OAuth Redirect URIs to your `META_OAUTH_REDIRECT_URI`
- Request permissions used by Sprint 1:
  - Instagram: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`
  - Facebook Pages: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `business_management`
- Instagram requires a Professional account linked to a Facebook Page

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/signup` | Create user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current session |
| PUT | `/api/auth/profile` | Update profile |
| POST | `/api/oauth/meta/start` | Start Meta OAuth |
| GET | `/api/oauth/meta/callback` | OAuth callback |
| GET | `/api/connections` | List connections |
| DELETE | `/api/connections/:platform` | Disconnect |
| GET/POST/PUT/DELETE | `/api/posts` | Scheduled posts CRUD |
| POST | `/api/ai/generate` | OpenAI caption + hashtags |
| GET/POST | `/api/ai/drafts` | Draft persistence |

## Sprint 1 scope notes

- Real OAuth: Instagram + Facebook only
- LinkedIn / X / YouTube UI remains, but connection is unavailable (not mocked)
- CRM, Leads, Agents, Analytics, Inbox mocks removed; gated for later sprints
- Publishing scheduled posts to social networks is out of Sprint 1 (storage + scheduling only)
