"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Envelope = { type: string; requestId?: string; payload?: any };
type Handler = (payload: any, env: Envelope) => void;

let seq = 0;
function nextId() { return `r_${Date.now().toString(36)}_${(seq++).toString(36)}`; }

export type BridgeState =
  | { kind: "connecting" }
  | { kind: "open" }
  | { kind: "device-offline" }
  | { kind: "closed"; code?: number };

export type Bridge = {
  state: BridgeState;
  request<T = any>(type: string, payload?: any, timeoutMs?: number): Promise<T>;
  subscribe(type: string, handler: Handler): () => void;
  subscribeRequest(type: string, payload: any, chunkTypes: string[], onChunk: (chunk: any, env: Envelope) => void): () => void;
};

export function useBridge(deviceId: string | null): Bridge {
  const [state, setState] = useState<BridgeState>({ kind: "connecting" });
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: any }>>(new Map());
  const subs = useRef<Map<string, Set<Handler>>>(new Map());
  const reqSubs = useRef<Map<string, Set<Handler>>>(new Map()); // requestId -> handlers

  useEffect(() => {
    if (!deviceId) return;
    let closedForever = false;
    let backoff = 1_000;

    async function connect() {
      setState({ kind: "connecting" });
      // Trade session cookie for a short-lived ticket, then open the WS.
      let ticket = "";
      let relayUrl = "";
      try {
        const res = await fetch("/api/ws-ticket", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        if (!res.ok) throw new Error(`ticket ${res.status}`);
        const j = await res.json();
        ticket = j.ticket;
        relayUrl = j.relayUrl || "";
      } catch (e) {
        console.error("[bridge] ticket fetch failed", e);
        setState({ kind: "closed" });
        if (closedForever) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
        return;
      }
      // Prefer the relay URL the server hands back; fall back to same-origin
      // (works when running locally with the combined dev server).
      let base: URL;
      if (relayUrl) {
        base = new URL(relayUrl);
      } else {
        base = new URL(location.href);
      }
      const wsProto = base.protocol === "https:" ? "wss:" : "ws:";
      const url = `${wsProto}//${base.host}/api/mobile?device=${encodeURIComponent(deviceId!)}&ticket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => setState({ kind: "open" }));
      ws.addEventListener("message", (e) => {
        let env: Envelope | null = null;
        try { env = JSON.parse(String(e.data)); } catch { return; }
        if (!env) return;
        if (env.type === "device:online") setState({ kind: "open" });
        if (env.type === "device:offline") setState({ kind: "device-offline" });
        // Route request-specific subscribers (for tails) FIRST
        if (env.requestId) {
          const set = reqSubs.current.get(env.requestId);
          if (set) for (const h of set) h(env.payload, env);
          const p = pending.current.get(env.requestId);
          if (p) {
            clearTimeout(p.timer);
            pending.current.delete(env.requestId);
            p.resolve(env.payload);
          }
        }
        // Route generic type subscribers
        const set = subs.current.get(env.type);
        if (set) for (const h of set) h(env.payload, env);
      });
      ws.addEventListener("close", (e) => {
        // Ignore late close events for a WS that is no longer the current one
        // (React StrictMode dev double-mounts create a stale WS whose close event
        // would otherwise clobber the freshly-opened one).
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        setState({ kind: "closed", code: e.code });
        for (const [, p] of pending.current) { clearTimeout(p.timer); p.reject(new Error("socket closed")); }
        pending.current.clear();
        if (closedForever) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      });
      ws.addEventListener("error", () => {});
    }

    connect();
    return () => {
      closedForever = true;
      try { wsRef.current?.close(); } catch {}
    };
  }, [deviceId]);

  const bridge = useMemo<Bridge>(() => ({
    state,
    request(type, payload, timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const ws = wsRef.current;
        const rs = ws ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][ws.readyState] : "no-ws";
        if (!ws || ws.readyState !== ws.OPEN) {
          console.error(`[bridge.request] not open: state=${rs} stateKind=${state.kind}`);
          return reject(new Error(`bridge not open (ws=${rs}, state=${state.kind})`));
        }
        const requestId = nextId();
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          reject(new Error("timeout"));
        }, timeoutMs);
        pending.current.set(requestId, { resolve, reject, timer });
        ws.send(JSON.stringify({ type, requestId, payload }));
      });
    },
    subscribe(type, handler) {
      let set = subs.current.get(type);
      if (!set) subs.current.set(type, (set = new Set()));
      set.add(handler);
      return () => { set!.delete(handler); };
    },
    subscribeRequest(type, payload, chunkTypes, onChunk) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== ws.OPEN) return () => {};
      const requestId = nextId();
      let set = reqSubs.current.get(requestId);
      if (!set) reqSubs.current.set(requestId, (set = new Set()));
      const handler: Handler = (payload, env) => {
        if (chunkTypes.includes(env.type)) onChunk(payload, env);
      };
      set.add(handler);
      ws.send(JSON.stringify({ type, requestId, payload }));
      return () => {
        set!.delete(handler);
        // best-effort stop
        try { ws.send(JSON.stringify({ type: `${type.split(":").slice(0, -1).join(":")}:stop`, requestId })); } catch {}
        reqSubs.current.delete(requestId);
      };
    },
  }), [state]);

  return bridge;
}
