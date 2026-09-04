import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CMUX_SOCK = path.join(os.homedir(), ".local", "state", "cmux", "cmux.sock");
const CMUX_CLI = "/opt/homebrew/bin/cmux";

export type CmuxStatus = {
  socketExists: boolean;
  passwordSet: boolean;
  ok: boolean;
  hint?: string;
};

function password(): string | null {
  const raw = process.env.CMUX_SOCKET_PASSWORD?.trim() || "";
  return raw ? raw : null;
}

export function status(): CmuxStatus {
  const socketExists = fs.existsSync(CMUX_SOCK);
  const passwordSet = !!password();
  if (!socketExists) {
    return { socketExists, passwordSet, ok: false, hint: "cmux is not running. Open cmux.app on your Mac." };
  }
  // Just probe. cmux CLI without --password works when the socket has no stored
  // password (even in password mode); our wrapper auto-retries without password
  // if a supplied one is rejected. So one probe covers both cases.
  const probe = cmux(["identify", "--json"]);
  if (!probe.ok) {
    return {
      socketExists,
      passwordSet,
      ok: false,
      hint: `cmux probe failed: ${probe.err ?? "unknown error"}. Try quitting and reopening cmux, or set Settings → Automation → Socket Control Mode = password.`,
    };
  }
  return { socketExists, passwordSet, ok: true };
}

// Explicitly clear CMUX_SOCKET_PASSWORD from the subprocess env for unauthed calls,
// because cmux's CLI reads it from env even when --password isn't passed.
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CMUX_SOCKET_PASSWORD;
  return env;
}

function cmux(args: string[]): { ok: boolean; out: string; err?: string } {
  const pw = password();
  const fullArgs = pw ? ["--password", pw, ...args] : args;
  const runOpts = { encoding: "utf8" as const, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"], timeout: 5000 };
  try {
    const out = execFileSync(CMUX_CLI, fullArgs, runOpts);
    return { ok: true, out };
  } catch (e: any) {
    const err = (e.stderr ?? e.message ?? "").toString();
    // Retry without password if it was rejected (cmux may accept unauth calls
    // when password mode is set but no password is actually stored).
    if (pw && /Invalid password/i.test(err)) {
      try {
        const out = execFileSync(CMUX_CLI, args, { ...runOpts, env: cleanEnv() });
        return { ok: true, out };
      } catch (e2: any) {
        return { ok: false, out: e2.stdout ?? "", err: (e2.stderr ?? e2.message ?? "").toString() };
      }
    }
    return { ok: false, out: e.stdout ?? "", err };
  }
}

export function listTree(): any {
  const r = cmux(["tree", "--all", "--json", "--id-format", "both"]);
  if (!r.ok) return { error: r.err || "cmux tree failed" };
  try { return JSON.parse(r.out); } catch { return { error: "invalid JSON from cmux tree", raw: r.out.slice(0, 500) }; }
}

export function readPane(paneRef: string, lines = 500): { ok: boolean; content?: string; error?: string } {
  // cmux's `read` returns recent output for a pane. Falls back to describing the surface.
  const r = cmux(["read", "--target", paneRef, "--lines", String(lines)]);
  if (!r.ok) return { ok: false, error: r.err || "cmux read failed" };
  return { ok: true, content: r.out };
}

export function sendKeys(paneRef: string, text: string, submit = false): { ok: boolean; error?: string } {
  const args = ["send", "--target", paneRef, "--text", text];
  if (submit) args.push("--submit");
  const r = cmux(args);
  return r.ok ? { ok: true } : { ok: false, error: r.err };
}

export function renameSurface(surfaceRef: string, newTitle: string): { ok: boolean; error?: string } {
  const r = cmux(["rename", "--target", surfaceRef, "--title", newTitle]);
  return r.ok ? { ok: true } : { ok: false, error: r.err };
}

// Find the cmux surface whose TTY matches the given one (e.g. "ttys004").
// cmux tree = windows > workspaces > panes > surfaces (each surface has .tty).
export function findPaneByTty(tty: string): { ref: string; title?: string } | null {
  if (!tty) return null;
  const normalized = tty.replace(/^\/dev\//, "").trim();
  const tree: any = listTree();
  if (!tree || tree.error) return null;
  for (const win of tree.windows ?? []) {
    for (const ws of win.workspaces ?? []) {
      for (const pane of ws.panes ?? []) {
        for (const surface of pane.surfaces ?? []) {
          const nodeTty = typeof surface.tty === "string" ? surface.tty.replace(/^\/dev\//, "").trim() : "";
          if (nodeTty && nodeTty === normalized) {
            return { ref: surface.ref, title: surface.title };
          }
        }
      }
    }
  }
  return null;
}
