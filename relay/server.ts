// Standalone WebSocket relay. Runs on Fly.io as a plain Node process (no Next.js).
// Auth model:
//   /api/relay   — bridge daemon, Authorization: Bearer <deviceToken>. Token
//                  is looked up by SHA-256 hash against the device table.
//   /api/mobile  — mobile browser, connects with ?device=X&ticket=<jwt>.
//                  The ticket is issued by the Vercel-hosted Next app after
//                  session auth. We just verify signature + claims here.
//
// Health check: GET /health returns 200 OK for Fly.io.
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { device } from "../lib/db/schema.ts";
import { verifyTicket } from "../lib/ws-ticket.ts";
import {
  attachBridge,
  detachBridge,
  fromBridge,
  fromMobile,
  subscribeMobile,
  unsubscribeMobile,
} from "../lib/relay.ts";

const port = Number(process.env.PORT ?? 8080);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!process.env.WS_TICKET_SECRET) throw new Error("WS_TICKET_SECRET not set");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const db = drizzle(pool, { schema: { device } });

function hashToken(t: string): string { return createHash("sha256").update(t).digest("hex"); }

function extractBearer(h: string | string[] | undefined): string | null {
  if (!h) return null;
  const s = Array.isArray(h) ? h[0] : h;
  const m = /^Bearer\s+(.+)$/i.exec(s.trim());
  return m ? m[1].trim() : null;
}

async function authenticateBridge(token: string): Promise<string | null> {
  const rows = await db.select({ id: device.id }).from(device).where(eq(device.tokenHash, hashToken(token))).limit(1);
  return rows[0]?.id ?? null;
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

const wssRelay = new WebSocketServer({ noServer: true });
const wssMobile = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", async (req, socket, head) => {
  const url = req.url ?? "/";
  const reject = (code: number) => {
    const status = code === 401 ? "401 Unauthorized" : "404 Not Found";
    try { (socket as any).write(`HTTP/1.1 ${status}\r\n\r\n`); } catch {}
    try { (socket as any).destroy(); } catch {}
  };

  if (url.startsWith("/api/relay")) {
    const token = extractBearer(req.headers["authorization"]);
    if (!token) return reject(401);
    const deviceId = await authenticateBridge(token);
    if (!deviceId) return reject(401);
    wssRelay.handleUpgrade(req, socket, head, (ws) => wireBridge(ws, deviceId));
    return;
  }

  if (url.startsWith("/api/mobile")) {
    const qi = url.indexOf("?");
    const params = new URLSearchParams(qi >= 0 ? url.slice(qi + 1) : "");
    const deviceId = params.get("device") ?? "";
    const ticket = params.get("ticket") ?? "";
    if (!deviceId || !ticket) return reject(401);
    const claims = await verifyTicket(ticket);
    if (!claims || claims.deviceId !== deviceId) return reject(401);
    wssMobile.handleUpgrade(req, socket, head, (ws) => wireMobile(ws, deviceId, claims.userId));
    return;
  }

  reject(404);
});

function wireBridge(ws: WebSocket, deviceId: string) {
  attachBridge(deviceId, ws);
  db.update(device).set({ lastSeenAt: new Date() }).where(eq(device.id, deviceId)).catch(() => {});
  console.log(`[relay] bridge connected: ${deviceId}`);

  const hb = setInterval(() => { if (ws.readyState === ws.OPEN) ws.ping(); }, 30_000);

  ws.on("message", (data) => {
    const raw = data.toString();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {}
    if (parsed?.type === "ping") {
      try { ws.send(JSON.stringify({ type: "pong", ts: Date.now(), echo: parsed.payload })); } catch {}
      return;
    }
    fromBridge(deviceId, raw);
  });

  ws.on("close", () => {
    clearInterval(hb);
    detachBridge(deviceId, ws);
    console.log(`[relay] bridge disconnected: ${deviceId}`);
  });
  ws.on("error", () => {});
}

function wireMobile(ws: WebSocket, deviceId: string, userId: string) {
  const conn = { ws, userId };
  subscribeMobile(deviceId, conn);
  console.log(`[relay] mobile subscribed: user=${userId} device=${deviceId}`);

  const hb = setInterval(() => { if (ws.readyState === ws.OPEN) ws.ping(); }, 30_000);

  ws.on("message", (data) => {
    const raw = data.toString();
    fromMobile(deviceId, raw);
  });

  ws.on("close", () => {
    clearInterval(hb);
    unsubscribeMobile(deviceId, conn);
    console.log(`[relay] mobile unsubscribed: user=${userId} device=${deviceId}`);
  });
  ws.on("error", () => {});
}

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`[relay] listening on :${port}`);
});
