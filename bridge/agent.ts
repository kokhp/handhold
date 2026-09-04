import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LABEL = "com.handhold.bridge";
const HOME = os.homedir();
const PLIST_PATH = path.join(HOME, "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG_DIR = path.join(HOME, "Library", "Logs");
const LOG_OUT = path.join(LOG_DIR, "handhold-bridge.log");
const LOG_ERR = path.join(LOG_DIR, "handhold-bridge.err.log");
const BRIDGE_ENTRY = path.resolve(new URL(".", import.meta.url).pathname, "index.ts");

function domainTarget() {
  const uid = process.getuid?.() ?? 501;
  return `gui/${uid}`;
}

function serviceTarget() {
  return `${domainTarget()}/${LABEL}`;
}

function writePlist(relayUrl: string) {
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const nodePath = process.execPath;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>--experimental-strip-types</string>
    <string>--no-warnings</string>
    <string>${BRIDGE_ENTRY}</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HANDHOLD_RELAY</key>
    <string>${relayUrl}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${LOG_OUT}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_ERR}</string>
</dict>
</plist>
`;
  fs.writeFileSync(PLIST_PATH, plist, { mode: 0o644 });
}

function launchctl(args: string[]): { ok: boolean; out: string } {
  try {
    const out = execSync(`launchctl ${args.join(" ")}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out };
  } catch (e: any) {
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? e.message ?? "") };
  }
}

export function cmdInstallAgent() {
  const cfgPath = path.join(HOME, ".handhold", "config.json");
  if (!fs.existsSync(cfgPath)) {
    console.error(`not paired. run: handhold pair <CODE>  (or via web dashboard first)`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const relayUrl: string = cfg.relayUrl ?? "http://localhost:3000";
  writePlist(relayUrl);
  console.log(`✓ wrote ${PLIST_PATH}`);
  // Idempotent stop then bootstrap so re-install applies updated plist.
  launchctl(["bootout", serviceTarget()]);
  const boot = launchctl(["bootstrap", domainTarget(), PLIST_PATH]);
  if (!boot.ok) {
    console.error(`launchctl bootstrap failed:\n${boot.out}`);
    process.exit(1);
  }
  const kick = launchctl(["kickstart", "-k", serviceTarget()]);
  if (!kick.ok) {
    console.error(`launchctl kickstart failed:\n${kick.out}`);
    process.exit(1);
  }
  console.log(`✓ agent installed and running (${LABEL})`);
  console.log(`  relay: ${relayUrl}`);
  console.log(`  logs:  ${LOG_OUT}`);
  console.log(`  stop:  handhold uninstall-agent`);
}

export function cmdUninstallAgent() {
  const r = launchctl(["bootout", serviceTarget()]);
  if (!r.ok && !r.out.includes("Could not find")) {
    console.error(`launchctl bootout failed:\n${r.out}`);
    // continue anyway to remove plist
  }
  if (fs.existsSync(PLIST_PATH)) {
    fs.unlinkSync(PLIST_PATH);
    console.log(`✓ removed ${PLIST_PATH}`);
  }
  console.log(`✓ agent stopped and uninstalled`);
}

export function cmdAgentStatus() {
  const r = launchctl(["print", serviceTarget()]);
  if (!r.ok) {
    console.log("agent not installed (or not running)");
    console.log(`  plist path: ${PLIST_PATH} (${fs.existsSync(PLIST_PATH) ? "exists" : "missing"})`);
    return;
  }
  // Extract the useful lines from launchctl print's verbose output
  const lines = r.out.split("\n");
  const wanted = ["state ", "pid ", "last exit ", "path ", "runs ", "spawns ", "domain ", "asid "];
  console.log(`agent ${LABEL}:`);
  for (const l of lines) {
    const t = l.trim();
    if (wanted.some((w) => t.startsWith(w))) console.log(`  ${t}`);
  }
  console.log(`  plist: ${PLIST_PATH}`);
  console.log(`  logs:  ${LOG_OUT}`);
}

export function cmdRestartAgent() {
  const r = launchctl(["kickstart", "-k", serviceTarget()]);
  if (!r.ok) {
    console.error(`restart failed (agent probably not installed):\n${r.out}`);
    process.exit(1);
  }
  console.log(`✓ agent restarted`);
}

export function cmdLogs(tail: number) {
  if (!fs.existsSync(LOG_OUT)) {
    console.log(`no logs yet at ${LOG_OUT}`);
    return;
  }
  try {
    const out = execSync(`tail -n ${tail} "${LOG_OUT}"`, { encoding: "utf8" });
    process.stdout.write(out);
    if (fs.existsSync(LOG_ERR) && fs.statSync(LOG_ERR).size > 0) {
      console.log(`--- stderr (${LOG_ERR}) ---`);
      const err = execSync(`tail -n ${tail} "${LOG_ERR}"`, { encoding: "utf8" });
      process.stdout.write(err);
    }
  } catch (e: any) {
    console.error(e.message);
  }
}
