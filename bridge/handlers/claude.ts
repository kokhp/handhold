import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

// Directory names encode cwd with `/` replaced by `-` AND include a leading
// dash. To reverse we replace only the segment separators, not the dashes
// inside real segment names (like "founding-eng-hunter"). Heuristic: the
// underlying cwd always starts with `/Users/` on macOS, so we walk directories
// from HOME to find the actual path that could have produced this id.
function decodeProjectPath(dirName: string): string {
  // Walk the real filesystem to disambiguate "dashes-in-a-segment" from
  // "dashes-as-separators". Prefer LONGER segment matches so a project like
  // "gyb-agentos-clone" wins over a coincidental "gyb" directory.
  const parts = dirName.split("-").filter(Boolean);
  const home = os.homedir();
  const search = (segments: string[], cur: string): string | null => {
    if (segments.length === 0) return cur;
    for (let take = segments.length; take >= 1; take--) {
      const candidate = segments.slice(0, take).join("-");
      const next = path.join(cur, candidate);
      try {
        const st = fs.statSync(next);
        if (st.isDirectory()) {
          const rest = search(segments.slice(take), next);
          if (rest) return rest;
        }
      } catch {}
    }
    return null;
  };
  if (parts.length >= 2 && parts[0] === "Users") {
    const anchored = search(parts.slice(2), home);
    if (anchored) return anchored;
  }
  return "/" + parts.join("/");
}

export type ProjectSummary = {
  id: string;
  cwd: string;
  sessionCount: number;
  activeSessionCount: number;
  lastModified: string | null;
};

export type SessionSummary = {
  id: string;
  projectId: string;
  fileSize: number;
  lastModified: string;
  active: boolean;
  title: string;
  pid?: number;
  tty?: string;
};

// Cache running claude processes for a short window (each call scans ps + lsof).
type ClaudeProc = { pid: number; tty: string; cwd: string };
let procCache: { at: number; procs: ClaudeProc[] } | null = null;

function listRunningClaudes(): ClaudeProc[] {
  if (procCache && Date.now() - procCache.at < 2500) return procCache.procs;
  const out: ClaudeProc[] = [];
  try {
    const psOut = execFileSync("/bin/ps", ["-axo", "pid=,tty=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    });
    for (const line of psOut.split("\n")) {
      const m = /^\s*(\d+)\s+(\S+)\s+(.+)$/.exec(line);
      if (!m) continue;
      const [, pidStr, tty, command] = m;
      if (tty === "??" || tty === "?" || tty === "-") continue;
      if (!/\bclaude(\b|$)/.test(command)) continue;
      if (/handhold\/bridge|bridge\/index\.ts/.test(command)) continue;
      const pid = Number(pidStr);
      let cwd = "";
      try {
        const l = execFileSync("/usr/sbin/lsof", ["-p", String(pid), "-Fn", "-a", "-d", "cwd"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 800,
        });
        const nline = l.split("\n").find((s) => s.startsWith("n"));
        cwd = nline ? nline.slice(1) : "";
      } catch {}
      if (!cwd) continue;
      out.push({ pid, tty, cwd });
    }
  } catch {}
  procCache = { at: Date.now(), procs: out };
  return out;
}

function findProcessForCwd(cwd: string): ClaudeProc | null {
  return listRunningClaudes().find((p) => p.cwd === cwd) ?? null;
}

// Extract the first user message text from a jsonl file (used as a human title).
function firstUserMessage(filePath: string, maxBytes = 32 * 1024): string | null {
  try {
    const stat = fs.statSync(filePath);
    const size = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    fs.closeSync(fd);
    for (const line of buf.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "user") continue;
        const msg = entry.message ?? {};
        let text = "";
        if (typeof msg.content === "string") text = msg.content;
        else if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === "text") { text += c.text ?? ""; }
          }
        }
        text = text.trim();
        if (text) return text.length > 100 ? text.slice(0, 100) + "…" : text;
      } catch {}
    }
  } catch {}
  return null;
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // recent write = still-live session

export function listProjects(): ProjectSummary[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const out: ProjectSummary[] = [];
  const now = Date.now();
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, e.name);
    let files: fs.Dirent[] = [];
    try { files = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    const jsonlFiles = files.filter((f) => f.isFile() && f.name.endsWith(".jsonl"));
    if (jsonlFiles.length === 0) continue;
    const cwd = decodeProjectPath(e.name);
    const hasRunningClaude = !!findProcessForCwd(cwd);
    let lastModified = 0;
    let activeCount = 0;
    for (const f of jsonlFiles) {
      try {
        const fp = path.join(dir, f.name);
        const s = fs.statSync(fp);
        if (s.mtimeMs > lastModified) lastModified = s.mtimeMs;
        if (hasRunningClaude && now - s.mtimeMs < ACTIVE_WINDOW_MS) activeCount++;
      } catch {}
    }
    out.push({
      id: e.name,
      cwd,
      sessionCount: jsonlFiles.length,
      activeSessionCount: activeCount,
      lastModified: lastModified > 0 ? new Date(lastModified).toISOString() : null,
    });
  }
  // Sort: active projects first, then by mtime desc.
  out.sort((a, b) => {
    if ((b.activeSessionCount > 0 ? 1 : 0) - (a.activeSessionCount > 0 ? 1 : 0) !== 0) {
      return (b.activeSessionCount > 0 ? 1 : 0) - (a.activeSessionCount > 0 ? 1 : 0);
    }
    return (b.lastModified ?? "").localeCompare(a.lastModified ?? "");
  });
  return out;
}

export function listSessions(projectId: string, opts: { activeOnly?: boolean } = {}): SessionSummary[] {
  const dir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(dir)) return [];
  const cwd = decodeProjectPath(projectId);
  const proc = findProcessForCwd(cwd);
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const out: SessionSummary[] = [];
  const now = Date.now();
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
    const fp = path.join(dir, f.name);
    try {
      const s = fs.statSync(fp);
      const recentlyWritten = now - s.mtimeMs < ACTIVE_WINDOW_MS;
      const active = !!proc && recentlyWritten;
      if (opts.activeOnly && !active) continue;
      const title = firstUserMessage(fp) ?? `session ${f.name.replace(/\.jsonl$/, "").slice(0, 8)}`;
      out.push({
        id: f.name.replace(/\.jsonl$/, ""),
        projectId,
        fileSize: s.size,
        lastModified: new Date(s.mtimeMs).toISOString(),
        active,
        title,
        pid: active ? proc!.pid : undefined,
        tty: active ? proc!.tty : undefined,
      });
    } catch {}
  }
  out.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.lastModified.localeCompare(a.lastModified);
  });
  return out;
}

export type TranscriptMessage = {
  type: string;
  role?: "user" | "assistant" | "system";
  timestamp?: string;
  summary?: string;
  text?: string;
  toolName?: string;
  raw?: any;
};

function summarize(entry: any): TranscriptMessage | null {
  if (!entry || typeof entry !== "object") return null;
  const t: string = entry.type ?? "unknown";
  if (t === "user" || t === "assistant") {
    const msg = entry.message ?? {};
    let text = "";
    let toolName: string | undefined;
    if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const c of msg.content) {
        if (c.type === "text") parts.push(c.text ?? "");
        else if (c.type === "tool_use") {
          toolName = c.name;
          parts.push(`[tool: ${c.name}] ${c.input ? JSON.stringify(c.input).slice(0, 500) : ""}`);
        } else if (c.type === "tool_result") {
          const inner = typeof c.content === "string" ? c.content : JSON.stringify(c.content).slice(0, 500);
          parts.push(`[tool result] ${inner}`);
        }
      }
      text = parts.join("\n");
    } else if (typeof msg.content === "string") {
      text = msg.content;
    } else if (typeof entry.text === "string") {
      text = entry.text;
    }
    return { type: t, role: entry.role ?? msg.role, timestamp: entry.timestamp, text, toolName };
  }
  if (t === "summary") return { type: t, summary: entry.summary, timestamp: entry.timestamp };
  if (t === "permission-mode" || t === "file-history-snapshot") return null;
  return { type: t, timestamp: entry.timestamp, raw: entry };
}

// Parse the entire jsonl and return every summarized message. Used internally
// for windowed reads. For huge transcripts this is O(n) each call, but n is
// bounded (each JSONL is tens of thousands of lines at worst).
function parseAll(file: string): TranscriptMessage[] {
  const buf = fs.readFileSync(file);
  const messages: TranscriptMessage[] = [];
  for (const line of buf.toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const m = summarize(JSON.parse(line));
      if (m) messages.push(m);
    } catch {}
  }
  return messages;
}

// Paginated read. Returns up to `limit` messages ending at `cursor` (exclusive).
// If cursor is null/undefined, returns the last `limit` messages of the file.
// hasMore=true when there are older messages before the returned slice.
export function readTranscriptWindow(
  projectId: string,
  sessionId: string,
  opts: { limit?: number; cursor?: number } = {},
): { messages: TranscriptMessage[]; startIndex: number; endIndex: number; total: number; hasMore: boolean } {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
  const file = path.join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);
  if (!fs.existsSync(file)) return { messages: [], startIndex: 0, endIndex: 0, total: 0, hasMore: false };
  const all = parseAll(file);
  const total = all.length;
  const cursor = typeof opts.cursor === "number" && opts.cursor >= 0 && opts.cursor <= total ? opts.cursor : total;
  const startIndex = Math.max(0, cursor - limit);
  const messages = all.slice(startIndex, cursor);
  return { messages, startIndex, endIndex: cursor, total, hasMore: startIndex > 0 };
}

// Legacy: full read (kept for backward compatibility with any older callers).
export function readTranscript(projectId: string, sessionId: string): { messages: TranscriptMessage[]; totalBytes: number } {
  const file = path.join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);
  if (!fs.existsSync(file)) return { messages: [], totalBytes: 0 };
  const stat = fs.statSync(file);
  return { messages: parseAll(file), totalBytes: stat.size };
}

export type TailHandle = { stop: () => void };

export function tailSession(
  projectId: string,
  sessionId: string,
  onMessages: (msgs: TranscriptMessage[]) => void,
): TailHandle {
  const file = path.join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);
  let lastSize = fs.existsSync(file) ? fs.statSync(file).size : 0;
  let stopped = false;
  let watcher: fs.FSWatcher | null = null;
  function drainDelta() {
    try {
      const stat = fs.statSync(file);
      if (stat.size <= lastSize) return;
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(stat.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stat.size;
      const msgs: TranscriptMessage[] = [];
      for (const line of buf.toString("utf8").split("\n")) {
        if (!line.trim()) continue;
        try { const m = summarize(JSON.parse(line)); if (m) msgs.push(m); } catch {}
      }
      if (msgs.length > 0) onMessages(msgs);
    } catch {}
  }
  try {
    watcher = fs.watch(file, { persistent: false }, () => { if (!stopped) drainDelta(); });
  } catch {}
  return { stop: () => { stopped = true; try { watcher?.close(); } catch {} } };
}

// Find PID + TTY of the claude process for a session's project.
export function sessionProcessInfo(projectId: string, _sessionId: string): { pid: number; tty?: string } | null {
  const cwd = decodeProjectPath(projectId);
  const proc = findProcessForCwd(cwd);
  return proc ? { pid: proc.pid, tty: proc.tty } : null;
}
