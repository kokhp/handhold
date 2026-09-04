import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

import * as claude from "./handlers/claude.ts";
import * as cmux from "./handlers/cmux.ts";
import * as browser from "./handlers/browser.ts";

const HOME = os.homedir();
const CONFIG_PATH = path.join(HOME, ".handhold", "config.json");
const DEFAULT_RELAY = process.env.HANDHOLD_RELAY ?? "http://localhost:3000";

type Config = { relayUrl: string; deviceId?: string; deviceToken?: string; deviceName?: string };
type Envelope = { type: string; requestId?: string; payload?: any };

function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) return { relayUrl: DEFAULT_RELAY };
  try { return { relayUrl: DEFAULT_RELAY, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; }
  catch { return { relayUrl: DEFAULT_RELAY }; }
}

function toWs(u: string): string { return u.replace(/^http/, "ws"); }

// Load cmux socket password from ~/.claude/env/cmux.env, if present.
// Bridge daemons don't inherit user shell env so we source it explicitly.
function loadCmuxEnv() {
  const p = path.join(HOME, ".claude", "env", "cmux.env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export function runDaemon() {
  loadCmuxEnv();
  const cfg = loadConfig();
  if (!cfg.deviceToken || !cfg.deviceId) {
    console.error("not paired. run: handhold pair <CODE>");
    process.exit(1);
  }

  const url = `${toWs(cfg.relayUrl)}/api/relay`;
  const tails = new Map<string, claude.TailHandle>(); // requestId -> tail

  let ws: WebSocket | null = null;
  let closedForever = false;
  let backoff = 1_000;

  function send(env: Envelope) {
    if (ws?.readyState === ws?.OPEN) {
      try { ws!.send(JSON.stringify(env)); } catch {}
    }
  }

  function reply(reqId: string | undefined, type: string, payload: any) {
    send({ type, requestId: reqId, payload });
  }

  async function handle(env: Envelope) {
    const { type, requestId: r } = env;
    console.error(`[bridge] ← ${type}${r ? ` (req=${r.slice(0, 10)})` : ""}`);
    try {
      switch (type) {
        case "ping":
          return reply(r, "pong", { ts: Date.now(), echo: env.payload });

        case "capabilities": {
          const cmuxSt = cmux.status();
          const browserSt = await browser.status();
          return reply(r, "capabilities:reply", {
            claude: { ok: true },
            cmux: cmuxSt,
            browser: browserSt,
            hostname: os.hostname(),
            uptimeSec: Math.floor(process.uptime()),
          });
        }

        case "sessions:list":
          return reply(r, "sessions:list:reply", { projects: claude.listProjects() });

        case "sessions:project": {
          const projectId = env.payload?.projectId;
          const activeOnly = !!env.payload?.activeOnly;
          if (!projectId) return reply(r, "error", { error: "projectId required" });
          return reply(r, "sessions:project:reply", { projectId, activeOnly, sessions: claude.listSessions(projectId, { activeOnly }) });
        }

        case "sessions:send": {
          const { projectId, sessionId, text } = env.payload ?? {};
          if (!projectId || !sessionId || typeof text !== "string") {
            return reply(r, "error", { error: "projectId, sessionId, text required" });
          }
          const proc = claude.sessionProcessInfo(projectId, sessionId);
          if (!proc?.tty) {
            return reply(r, "sessions:send:reply", { ok: false, error: "Could not find the running claude process or its TTY. Make sure the terminal is still open." });
          }
          const cmuxSt = cmux.status();
          if (!cmuxSt.ok) {
            return reply(r, "sessions:send:reply", { ok: false, error: "cmux not reachable, so we can't type into your terminal. " + (cmuxSt.hint ?? "") });
          }
          const pane = cmux.findPaneByTty(proc.tty);
          if (!pane) {
            return reply(r, "sessions:send:reply", { ok: false, error: `No cmux pane found for TTY ${proc.tty}. Make sure this claude is running inside a cmux terminal.` });
          }
          const send = cmux.sendKeys(pane.ref, text, true);
          return reply(r, "sessions:send:reply", { ok: send.ok, error: send.error, pane: pane.ref, tty: proc.tty });
        }

        case "sessions:get": {
          const { projectId, sessionId, limit, cursor } = env.payload ?? {};
          if (!projectId || !sessionId) return reply(r, "error", { error: "projectId and sessionId required" });
          const t = claude.readTranscriptWindow(projectId, sessionId, { limit, cursor });
          return reply(r, "sessions:get:reply", { projectId, sessionId, ...t });
        }

        case "sessions:tail:start": {
          const { projectId, sessionId } = env.payload ?? {};
          if (!projectId || !sessionId || !r) return reply(r, "error", { error: "projectId, sessionId, requestId required" });
          // Stop any existing tail for this requestId
          tails.get(r)?.stop();
          const handle = claude.tailSession(projectId, sessionId, (msgs) => {
            send({ type: "sessions:tail:chunk", requestId: r, payload: { projectId, sessionId, messages: msgs } });
          });
          tails.set(r, handle);
          return reply(r, "sessions:tail:started", { projectId, sessionId });
        }

        case "sessions:tail:stop": {
          if (r) { tails.get(r)?.stop(); tails.delete(r); }
          return reply(r, "sessions:tail:stopped", {});
        }

        case "cmux:list":
          return reply(r, "cmux:list:reply", { status: cmux.status(), tree: cmux.status().ok ? cmux.listTree() : null });

        case "cmux:read": {
          const { target, lines } = env.payload ?? {};
          if (!target) return reply(r, "error", { error: "target required" });
          return reply(r, "cmux:read:reply", { target, ...cmux.readPane(target, lines ?? 500) });
        }

        case "cmux:write": {
          const { target, text, submit } = env.payload ?? {};
          if (!target || typeof text !== "string") return reply(r, "error", { error: "target and text required" });
          return reply(r, "cmux:write:reply", { target, ...cmux.sendKeys(target, text, !!submit) });
        }

        case "cmux:rename": {
          const { target, title } = env.payload ?? {};
          if (!target || !title) return reply(r, "error", { error: "target and title required" });
          return reply(r, "cmux:rename:reply", { target, ...cmux.renameSurface(target, title) });
        }

        case "browser:tabs":
          return reply(r, "browser:tabs:reply", await browser.listTabs());

        case "browser:activate": {
          const { tabId } = env.payload ?? {};
          if (!tabId) return reply(r, "error", { error: "tabId required" });
          return reply(r, "browser:activate:reply", await browser.activateTab(tabId));
        }

        case "browser:close": {
          const { tabId } = env.payload ?? {};
          if (!tabId) return reply(r, "error", { error: "tabId required" });
          return reply(r, "browser:close:reply", await browser.closeTab(tabId));
        }

        case "browser:launch-debug":
          return reply(r, "browser:launch-debug:reply", await browser.launchDebug());

        default:
          return reply(r, "error", { error: `unknown type: ${type}` });
      }
    } catch (e: any) {
      reply(r, "error", { error: e?.message ?? "handler crashed", type });
    }
  }

  function connect() {
    console.error(`[bridge] connecting to ${url}`);
    ws = new WebSocket(url, { headers: { Authorization: `Bearer ${cfg.deviceToken}` } });

    ws.on("open", () => {
      console.error(`[bridge] connected as ${cfg.deviceName ?? cfg.deviceId}`);
      backoff = 1_000;
      send({ type: "ping", payload: { hostname: os.hostname() } });
    });

    ws.on("message", (raw) => {
      const text = raw.toString();
      let env: Envelope | null = null;
      try { env = JSON.parse(text); } catch { return; }
      if (env) void handle(env);
    });

    ws.on("close", (code) => {
      console.error(`[bridge] closed code=${code}, reconnecting in ${backoff}ms`);
      // Kill all tails on disconnect; mobile will re-request on reconnect.
      for (const t of tails.values()) t.stop();
      tails.clear();
      if (closedForever) return;
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    });

    ws.on("error", (err) => {
      console.error(`[bridge] error: ${(err as Error).message}`);
    });
  }

  connect();

  const shutdown = () => {
    closedForever = true;
    for (const t of tails.values()) t.stop();
    try { ws?.close(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
