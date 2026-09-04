@AGENTS.md

# handhold

Mobile-first web app that pairs with a Mac bridge daemon so the user can see and control cmux terminals, Claude Code sessions, browsers, and files from their phone. Multi-tenant, auth-gated.

## Stack (locked in Phase 1)

- Next.js 16 App Router, TypeScript, Tailwind v4, pnpm
- Better Auth (email+password + magic link + 30-day sliding sessions)
- Postgres + Drizzle ORM. **Always create migration files with `pnpm db:generate`, never `db push`.**
- Deploy target: Dokploy on Contabo (goflirco fleet)

## Phase status

- **Phase 1 (done):** auth foundation, protected dashboard shell, PWA manifest
- **Phase 2 (done):** Mac bridge (`bridge/`), pairing flow, WebSocket relay in `server.ts`, launchd LaunchAgent (`handhold install-agent`) so bridge survives terminal close
- **Phase 3 (done):** device detail page at `/dashboard/[deviceId]` with 3-tab bottom nav. Claude Code sessions (list projects → sessions → live transcript). cmux terminals with probe-based status + setup fallback. Chrome browser tabs via CDP with setup fallback.
- **Phase 4 (deferred):** filebrowser file tree, Dokploy deploy config, single-file bridge binary distribution

## Runtime

Dev uses `server.ts` (custom Node http + Next.js + `ws`). Do NOT use `next dev` directly; the WebSocket routes need the custom server. Env is loaded via tsx `--env-file-if-exists=.env.local`.

### Custom-server gotchas that will bite you

- **Do NOT pre-parse URLs.** Passing `parseUrl(req.url, true)` as the third arg to Next's request handler breaks Turbopack client hydration silently (form renders as static HTML, no `__reactFiber`). Call `handler(req, res)` only.
- **Delegate non-matched WS upgrades to Next.** After `await app.prepare()`, grab `app.getUpgradeHandler()` and call it for any upgrade that isn't `/api/relay` or `/api/mobile`. Otherwise `/_next/hmr` returns 404 and dev refresh silently dies.
- **Order matters.** `app.getUpgradeHandler()` must be called AFTER `prepare()`, or it throws.
- **`allowedDevOrigins`** in `next.config.ts` must include LAN patterns (`192.168.*.*`, etc.) so phones on the same wifi can load `_next/hmr` and static chunks. Restart dev server after changing this.
- **Auth client `baseURL` must be omitted** (relative URLs). If you set `baseURL: "http://localhost:3000"`, phones at `http://192.168.1.6:3000` post auth to their own IP instead of the Mac.
- **`useSearchParams()` requires Suspense boundary** in App Router. Cleaner: read `window.location.search` inside the submit handler and skip the hook.
- **No `toLocaleString()` in SSR-rendered UI.** Node and browser produce different formats → hydration mismatch. Use `toISOString().slice(0,10)` for dates or format entirely on the client after mount.

## cmux integration gotchas

- **Do NOT force `--password` in every call.** cmux may be in `socketControlMode=password` but with no password actually stored (the settings UI can migrate the value away). In that state the socket accepts unauth calls and rejects any explicit password as "Invalid password". Bridge's `cmux()` wrapper (`bridge/handlers/cmux.ts`) tries with `--password` first, then automatically retries WITHOUT password AND with `CMUX_SOCKET_PASSWORD` scrubbed from the subprocess env, since the CLI reads that env var by default.
- **cmux tree shape**: `tree.windows[].workspaces[].panes[].surfaces[]`. Surface has `ref`, `title`, `tty`, `type`. The "terminal tab" a user thinks of is a **surface**, not a pane (a pane is a split within a workspace).

## Transcript pagination

- `sessions:get { limit, cursor }` returns a **window** of messages: last `limit` before `cursor` (default cursor = totalMessages, so first call gets the tail). Response is `{ messages, startIndex, endIndex, total, hasMore }`.
- Client keeps a windowed slice in memory (default 100, hard cap 600). "Load older" button (or scrolling near top) prepends the previous page and preserves the visual scroll offset via `useLayoutEffect` (snapshots prevScrollHeight+prevScrollTop before the state update, restores after).
- Initial scroll-to-bottom uses **double `requestAnimationFrame`** inside a useEffect keyed on `loaded`. Single raf isn't enough because messages with big text blocks don't have final heights until after the next paint.
- Live tail chunks append and auto-scroll only if `stickToBottomRef.current` (set by an `onScroll` handler that flips to false when the user scrolls up).

## Claude Code active-session detection

`lsof` on the JSONL file is unreliable — Claude Code opens, appends, and closes the file per write, so it's rarely held open. Instead:
- Enumerate running `claude` processes via `ps -axo pid=,tty=,command=`, get each process's cwd via `lsof -Fn -a -d cwd`.
- A JSONL is "live" iff (a) a claude process exists in the matching cwd AND (b) mtime is within 5 min. This catches actively-writing sessions and avoids stale ones.
- For "send to session": look up the running claude process by project cwd, get its TTY, find the cmux surface whose `.tty` matches, then `cmux send --target <ref> --text <text> --submit`.

## Bridge

- Source: `bridge/index.ts` (CLI) → `bridge/daemon.ts` (relay client + handler dispatch) → `bridge/handlers/*.ts` (claude / cmux / browser).
- Runs under `node --experimental-strip-types --no-warnings bridge/index.ts run`. **Internal imports MUST have `.ts` extensions** for Node's ESM strip-types loader (tsx tolerates missing extensions, node doesn't).
- Config: `~/.handhold/config.json` (0600), contains `deviceId`, `deviceToken` (long-lived), `relayUrl`
- LaunchAgent plist: `~/Library/LaunchAgents/com.handhold.bridge.plist`, `KeepAlive=true`, `RunAtLoad=true`, `ThrottleInterval=5`. Logs at `~/Library/Logs/handhold-bridge{,.err}.log`.
- **Logging goes to stderr, not stdout.** Under launchd, stdout is block-buffered when redirected to a file; stderr is line-buffered. All `console.error(...)` in daemon code.
- Commands: `pair <CODE>`, `run`, `status`, `unpair`, `install-agent`, `uninstall-agent`, `restart-agent`, `agent-status`, `logs [N]`
- Reconnect: exponential backoff up to 30s. Auto-loads `~/.claude/env/cmux.env` on startup.
- Env override: `HANDHOLD_RELAY` sets relay URL. `CMUX_SOCKET_PASSWORD` for cmux integration.

## use-bridge (client hook) gotchas

- WebSocket close handlers MUST guard against stale-mount close events: `if (wsRef.current !== ws) return`. React 19 StrictMode dev double-invokes effects, so the first WS's close event fires **after** the second WS is created; without the guard it nulls the ref and rejects all requests.
- Same guard for the state update: only setState({kind:'closed'}) if the closing WS is still current.

## Message envelope

JSON only: `{"type": "...", "requestId?: "...", "payload": ...}`. Request/response uses `requestId` for correlation; server replies with `{type: "...:reply", requestId: <same>}`. Streams use `subscribeRequest` on the client, which sends the initial request and multiplexes chunks by requestId until unsubscribe (which sends a `...:stop` message).

Reserved types:
- `ping` / `pong` — liveness
- `device:online` / `device:offline` — relay broadcasts to mobile
- `capabilities` / `capabilities:reply` — probes bridge features + hostname
- `sessions:list|project|get|tail:start|tail:stop` (+ their `:reply` and `sessions:tail:chunk`)
- `cmux:list|read|write|rename` (+ `:reply`)
- `browser:tabs|activate|close` (+ `:reply`)

## Pairing model

- User clicks "Pair a Mac" on dashboard → server creates device row with 8-char code (alphabet excludes I/l/0/O), 10-minute TTL
- Bridge POSTs {code, hostname} to `/api/devices/claim`, receives `{deviceId, deviceToken}` (device token = `dvt_<base64url 32B>`, hashed with SHA-256 at rest)
- Bridge opens persistent WS to `/api/relay` with `Authorization: Bearer <token>`
- Server auths token by hash → attaches bridge to deviceId, broadcasts `device:online` to mobile subscribers
- Mobile opens WS to `/api/mobile?device=<id>` (session cookie auth) → server verifies user owns device → subscribes for events

## Message envelope

JSON only: `{"type": "...", "payload": ...}`. Reserved types so far:
- `ping` / `pong` — bridge liveness handshake
- `device:online` / `device:offline` — relay-broadcast to mobiles
- Everything else: relayed verbatim between bridge and mobiles for that device

## Non-negotiables

- No em-dashes anywhere the user might see (copy, emails, docs). Use commas or colons.
- Mobile-first for every new UI surface. Touch targets >= 44px. Test iPhone viewport before desktop.
- Session length is 30 days sliding. Do not lower it. Remember-me checkbox on login controls persistent vs. session cookie.
- The socket password for cmux lives at `~/.claude/env/cmux.env` (600 perms). Do not commit.
- Bridge daemon (Phase 2) authenticates to relay via a per-device token issued at pairing time. It is NOT the cmux socket password.

## Local dev

```bash
brew services start postgresql@16
pnpm install
pnpm db:migrate
pnpm dev
```

Magic-link emails print to server console when `RESEND_API_KEY` is empty.

## Auth surface

- `/login` — email+pw + magic link, remember-me default on
- `/signup` — name+email+pw
- `/forgot` — magic-link recovery
- `/api/auth/*` — Better Auth handler
- Protected: `/dashboard` (middleware.ts)

## Schema (Better Auth core + our tables)

- `user`, `session`, `account`, `verification` — Better Auth managed
- `device` — our own, for Phase 2 pairing. `pairingCode` unique, expires, then paired to a user.

## Next 16 gotchas

- Read `AGENTS.md` and `node_modules/next/dist/docs/agents/` before assuming API shapes. Layout props use the new `LayoutProps<"/">` generic. Route handlers, middleware, and `cookies()`/`headers()` are async.
