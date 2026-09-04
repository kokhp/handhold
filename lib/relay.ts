import type { WebSocket } from "ws";

// One bridge connection per device. Multiple mobiles can subscribe per device.
type BridgeConn = { ws: WebSocket; connectedAt: number };
type MobileConn = { ws: WebSocket; userId: string };

const bridges = new Map<string, BridgeConn>();
const mobiles = new Map<string, Set<MobileConn>>();

export function attachBridge(deviceId: string, ws: WebSocket) {
  const prev = bridges.get(deviceId);
  if (prev) {
    try { prev.ws.close(4001, "replaced"); } catch {}
  }
  bridges.set(deviceId, { ws, connectedAt: Date.now() });
  broadcastToMobiles(deviceId, { type: "device:online", deviceId });
}

export function detachBridge(deviceId: string, ws: WebSocket) {
  const cur = bridges.get(deviceId);
  if (cur?.ws === ws) {
    bridges.delete(deviceId);
    broadcastToMobiles(deviceId, { type: "device:offline", deviceId });
  }
}

export function isDeviceOnline(deviceId: string): boolean {
  return bridges.has(deviceId);
}

export function subscribeMobile(deviceId: string, conn: MobileConn) {
  let set = mobiles.get(deviceId);
  if (!set) mobiles.set(deviceId, (set = new Set()));
  set.add(conn);
  // Tell the mobile the current state as soon as it subscribes.
  const online = bridges.has(deviceId);
  try {
    conn.ws.send(JSON.stringify({ type: online ? "device:online" : "device:offline", deviceId }));
  } catch {}
}

export function unsubscribeMobile(deviceId: string, conn: MobileConn) {
  const set = mobiles.get(deviceId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) mobiles.delete(deviceId);
}

export function fromBridge(deviceId: string, raw: string) {
  const set = mobiles.get(deviceId);
  if (!set || set.size === 0) return;
  for (const m of set) {
    try { m.ws.send(raw); } catch {}
  }
}

export function fromMobile(deviceId: string, raw: string) {
  const b = bridges.get(deviceId);
  if (!b) return false;
  try { b.ws.send(raw); return true; } catch { return false; }
}

function broadcastToMobiles(deviceId: string, msg: object) {
  const set = mobiles.get(deviceId);
  if (!set) return;
  const raw = JSON.stringify(msg);
  for (const m of set) {
    try { m.ws.send(raw); } catch {}
  }
}
