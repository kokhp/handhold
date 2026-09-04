# Deploy: Vercel (Next.js) + Fly.io (WS relay) + Supabase (Postgres)

**One-time setup** for a remote-testable environment.

## 0. Prereqs

Already installed:
- `vercel` CLI (logged in)
- `flyctl` CLI (not yet logged in)
- `pnpm`, `node 22`

Not yet:
- A Supabase project (you make one, we paste the connection string)
- `flyctl auth login` (interactive browser)

## 1. Supabase

1. https://supabase.com/dashboard/new → new project, any region close to you
2. Wait ~2 min for provisioning
3. Project Settings → Database → **Connection string** → **URI** (Session mode, not pooled)
4. Copy the string. Replace `[YOUR-PASSWORD]` with the DB password Supabase showed at creation.
5. In this repo:
   ```bash
   export SUPABASE_DB_URL="postgresql://postgres.abcxyz:...@aws-...supabase.com:5432/postgres"
   ./node_modules/.bin/drizzle-kit migrate --url "$SUPABASE_DB_URL"
   ```
   (If drizzle-kit doesn't accept `--url`, set `DATABASE_URL=$SUPABASE_DB_URL` in shell env first.)

## 2. Fly.io (relay)

```bash
flyctl auth login          # opens browser once

# One-time app create (uses fly.toml in repo root)
flyctl launch --no-deploy --copy-config --name handhold-relay --region sin

# Secrets (used by relay/server.ts at runtime)
flyctl secrets set \
  DATABASE_URL="$SUPABASE_DB_URL" \
  WS_TICKET_SECRET="$(openssl rand -base64 32)"

# Deploy
flyctl deploy

# Verify
curl -s https://handhold-relay.fly.dev/health   # -> "ok"
```

Copy the WS_TICKET_SECRET value; you need the SAME one on Vercel below.

## 3. Vercel (Next.js)

```bash
vercel link                 # link this dir to a project (accept defaults)

# Set env vars (repeat for --preview if you want previews to work too)
vercel env add DATABASE_URL production            # paste $SUPABASE_DB_URL
vercel env add BETTER_AUTH_SECRET production      # openssl rand -base64 32
vercel env add BETTER_AUTH_URL production         # https://<your-vercel-domain>.vercel.app
vercel env add WS_TICKET_SECRET production        # SAME value as Fly.io above
vercel env add NEXT_PUBLIC_RELAY_URL production   # https://handhold-relay.fly.dev

# Deploy
vercel deploy --prod
```

## 4. Bridge daemon (repoint at prod relay)

On the Mac you want to control:

```bash
cd ~/projects/handhold
handhold uninstall-agent

# Re-pair against the prod URL. Get the code from your phone at
# https://<your-vercel-domain>.vercel.app first.
HANDHOLD_RELAY=https://handhold-relay.fly.dev pnpm bridge pair <CODE>

# Install as launchd agent; plist bakes the current relayUrl.
pnpm bridge install-agent

# Verify
pnpm bridge agent-status
pnpm bridge logs 20   # should show "connected as ..."
```

## 5. Test on phone

Open `https://<your-vercel-domain>.vercel.app` on cellular (or anywhere in the world) → sign in → device should show online → tap in → all three tabs (Claude / Terminals / Browser) work exactly like local.

## Architecture recap

```
mobile browser (Vercel)  ---HTTP (cookie auth)-->  POST /api/ws-ticket  --returns JWT--> browser
mobile browser  ---WSS wss://handhold-relay.fly.dev/api/mobile?ticket=JWT-->  Fly.io relay
                                                                                    |
Mac bridge daemon  ---WSS wss://handhold-relay.fly.dev/api/relay (Bearer token)-->  |
                                                                                    v
                                                                          in-memory pair map
                                                                          bidirectional forward
```

Both services read from the SAME Supabase Postgres (device table). `WS_TICKET_SECRET` must be identical on both.
