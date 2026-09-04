# handhold

Your Mac in your pocket. Mobile-first web app that pairs with a bridge daemon on your Mac to give you visibility into terminals, agent sessions, browsers, and files, over the internet, safely.

**Status:** Phase 1 (auth foundation) shipped.

## Stack

- Next.js 16 App Router, TypeScript, Tailwind v4
- Better Auth (email+password, magic link, 30-day sliding sessions)
- Postgres + Drizzle ORM (migration files, no `db push`)
- pnpm

## Local dev

```bash
brew services start postgresql@16
createdb handhold_dev

cp .env.example .env.local
# fill in BETTER_AUTH_SECRET (openssl rand -base64 32)

pnpm install
pnpm db:migrate
pnpm dev
# → http://localhost:3000
```

Magic-link emails print to the server console when `RESEND_API_KEY` is empty. Set it to send real emails via Resend.

## Auth model

- Email + password sign up / sign in
- Magic link sign in via Resend
- "Keep me signed in for 30 days" checkbox on `/login` (default on). Unchecked = session cookie that ends at browser close.
- Sliding refresh: any activity within the window extends the session by 30 days.
- Sessions stored in Postgres; revocable server-side.

## Scripts

| script | what |
|---|---|
| `pnpm dev` | Next dev server on :3000 |
| `pnpm build` | production build |
| `pnpm db:generate` | create migration from schema changes |
| `pnpm db:migrate` | apply pending migrations |
| `pnpm db:studio` | Drizzle Studio (browse DB) |
| `pnpm typecheck` | tsc --noEmit |

## Roadmap

- **Phase 1 (done):** auth + protected `/dashboard` shell + PWA manifest
- **Phase 2:** Mac bridge daemon (Bun single-file), pairing code flow, WebSocket relay
- **Phase 3:** cmux integration, terminals list, live streaming, send input, rename
- **Phase 4:** browsers (Chrome CDP), files (filebrowser), Claude Code transcripts, Dokploy deploy

## Project layout

```
app/
  (auth)/                       login, signup, forgot
  dashboard/                    protected
  api/auth/[...all]/route.ts    Better Auth handler
  layout.tsx                    mobile viewport + PWA meta
  manifest.ts                   PWA manifest
  page.tsx                      redirect based on auth
lib/
  auth.ts                       Better Auth server config
  auth-client.ts                React client
  db/                           Drizzle
  email.ts                      magic link email via Resend (or console in dev)
middleware.ts                   protect /dashboard
drizzle/                        migrations
```
