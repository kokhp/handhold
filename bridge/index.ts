#!/usr/bin/env -S node --experimental-strip-types --no-warnings
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cmdInstallAgent, cmdUninstallAgent, cmdAgentStatus, cmdRestartAgent, cmdLogs } from "./agent.ts";
import { runDaemon } from "./daemon.ts";

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, ".handhold");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
// The HTTP API (Vercel-hosted Next.js). Handles pairing.
const DEFAULT_APP_URL = process.env.HANDHOLD_APP_URL ?? process.env.HANDHOLD_RELAY ?? "http://localhost:3000";
// The WebSocket relay (Render-hosted). Handles bridge<->mobile message forwarding.
const DEFAULT_RELAY = process.env.HANDHOLD_RELAY ?? "http://localhost:3000";

type Config = { relayUrl: string; appUrl?: string; deviceId?: string; deviceToken?: string; deviceName?: string };

function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) return { relayUrl: DEFAULT_RELAY, appUrl: DEFAULT_APP_URL };
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return { relayUrl: DEFAULT_RELAY, appUrl: DEFAULT_APP_URL, ...saved };
  }
  catch { return { relayUrl: DEFAULT_RELAY, appUrl: DEFAULT_APP_URL }; }
}

function saveConfig(cfg: Config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function friendlyMacName(): string {
  // scutil --get ComputerName returns "Himanshu's MacBook Pro"; falls back to
  // os.hostname() which on some networks is the IP or a mDNS ".local" name.
  try {
    const out = require("node:child_process").execFileSync("/usr/sbin/scutil", ["--get", "ComputerName"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000,
    }).trim();
    if (out) return out;
  } catch {}
  return os.hostname();
}

async function cmdPair(code: string) {
  if (!code) { console.error("usage: handhold pair <CODE>"); process.exit(1); }
  const cfg = loadConfig();
  const hostname = friendlyMacName();
  // Claim is an HTTP request against the Next.js app (Vercel), not the WS relay.
  const claimUrl = `${cfg.appUrl ?? cfg.relayUrl}/api/devices/claim`;
  const res = await fetch(claimUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: code.trim().toUpperCase(), hostname }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`pair failed [${res.status}]: ${body}`);
    process.exit(1);
  }
  const data = (await res.json()) as { deviceId: string; deviceToken: string; name: string };
  saveConfig({
    relayUrl: cfg.relayUrl,
    appUrl: cfg.appUrl,
    deviceId: data.deviceId,
    deviceToken: data.deviceToken,
    deviceName: data.name,
  });
  console.log(`✓ paired as "${data.name}" (device ${data.deviceId})`);
  console.log(`  config saved to ${CONFIG_PATH}`);
  console.log(`  install as background agent: handhold install-agent`);
}

function cmdStatus() {
  const cfg = loadConfig();
  console.log(JSON.stringify(
    {
      configPath: CONFIG_PATH,
      relayUrl: cfg.relayUrl,
      deviceId: cfg.deviceId ?? null,
      deviceName: cfg.deviceName ?? null,
      paired: !!cfg.deviceToken,
    },
    null,
    2,
  ));
}

function cmdUnpair() {
  if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  console.log("✓ config removed. re-pair with: handhold pair <CODE>");
}

function usage() {
  console.log(`handhold bridge

pairing:
  handhold pair <CODE>       claim a pairing code from the web dashboard
  handhold status            show config
  handhold unpair            forget saved token

running:
  handhold run               start the bridge in foreground (Ctrl-C to stop)
  handhold install-agent     install as launchd LaunchAgent (survives terminal close)
  handhold uninstall-agent   stop and remove the LaunchAgent
  handhold restart-agent     force-restart the LaunchAgent
  handhold agent-status      show LaunchAgent state
  handhold logs [N]          tail N lines of the daemon log (default 100)

env:
  HANDHOLD_RELAY             relay URL (default ${DEFAULT_RELAY})
  CMUX_SOCKET_PASSWORD       cmux socket password if socket is in password mode
                              (also loaded from ~/.claude/env/cmux.env at startup)
`);
}

const [, , sub, ...rest] = process.argv;
switch (sub) {
  case "pair":            await cmdPair(rest[0] ?? ""); break;
  case "run":             runDaemon(); break;
  case "status":          cmdStatus(); break;
  case "unpair":          cmdUnpair(); break;
  case "install-agent":   cmdInstallAgent(); break;
  case "uninstall-agent": cmdUninstallAgent(); break;
  case "restart-agent":   cmdRestartAgent(); break;
  case "agent-status":    cmdAgentStatus(); break;
  case "logs":            cmdLogs(Number(rest[0] ?? "100")); break;
  default:
    usage();
    process.exit(sub ? 1 : 0);
}
