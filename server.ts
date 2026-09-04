import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db, schema } from "./lib/db";
import { hashToken } from "./lib/ids";
import { verifyTicket } from "./lib/ws-ticket";
import {
  attachBridge,
  detachBridge,
  fromBridge,
  fromMobile,
  subscribeMobile,
  unsubscribeMobile,
} from "./lib/relay";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

async function main() {
  const app = next({ dev, hostname, port });
  const handler = app.getRequestHandler();
  await app.prepare();
  const nextUpgrade = app.getUpgradeHandler();

  const httpServer = createServer((req, res) => handler(req, res));

  const wssRelay = new WebSocketServer({ noServer: true });
  const wssMobile = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api/relay")) {
      const token = extractBearer(req.headers["authorization"]);
      if (!token) return reject(socket, 401);
      const deviceId = await authenticateBridge(token);
      if (!deviceId) return reject(socket, 401);
      wssRelay.handleUpgrade(req, socket, head, (ws) => wireBridge(ws, deviceId));
      return;
    }
    if (url.startsWith("/api/mobile")) {
      const qi = url.indexOf("?");
      const params = new URLSearchParams(qi >= 0 ? url.slice(qi + 1) : "");
      const deviceId = params.get("device") ?? "";
      const ticket = params.get("ticket") ?? "";
      if (!deviceId || !ticket) return reject(socket, 401);
      const claims = await verifyTicket(ticket);
      if (!claims || claims.deviceId !== deviceId) return reject(socket, 401);
      wssMobile.handleUpgrade(req, socket, head, (ws) => wireMobile(ws, deviceId, claims.userId));
      return;
    }
    // Delegate everything else (like /_next/hmr) to Next.js's own upgrade handler
    nextUpgrade(req, socket, head);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`▲ handhold listening on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}`);
  });
}

function reject(socket: any, code: number) {
  const status = code === 401 ? "401 Unauthorized" : "404 Not Found";
  try { socket.write(`HTTP/1.1 ${status}\r\n\r\n`); } catch {}
  try { socket.destroy(); } catch {}
}

function extractBearer(h: string | string[] | undefined): string | null {
  if (!h) return null;
  const s = Array.isArray(h) ? h[0] : h;
  const m = /^Bearer\s+(.+)$/i.exec(s.trim());
  return m ? m[1].trim() : null;
}

async function authenticateBridge(token: string): Promise<string | null> {
  const hash = hashToken(token);
  const rows = await db.select({ id: schema.device.id }).from(schema.device).where(eq(schema.device.tokenHash, hash)).limit(1);
  return rows[0]?.id ?? null;
}

function wireBridge(ws: WebSocket, deviceId: string) {
  attachBridge(deviceId, ws);
  db.update(schema.device).set({ lastSeenAt: new Date() }).where(eq(schema.device.id, deviceId)).catch(() => {});
  console.log(`[relay] bridge connected: ${deviceId}`);

  const hb = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
  }, 30_000);

  ws.on("message", (data) => {
    const raw = data.toString();
    // For Phase 2: reply to ping locally, forward everything else to subscribed mobiles.
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

  const hb = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
  }, 30_000);

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

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
