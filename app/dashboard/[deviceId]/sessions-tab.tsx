"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  Hash,
  MessageSquare,
  Wrench,
} from "lucide-react";
import type { Bridge } from "@/lib/use-bridge";

type Project = { id: string; cwd: string; sessionCount: number; activeSessionCount: number; lastModified: string | null };
type Session = { id: string; projectId: string; fileSize: number; lastModified: string; active: boolean; title: string; pid?: number; tty?: string };
type Msg = { type: string; role?: string; timestamp?: string; text?: string; summary?: string; toolName?: string };

export function SessionsTab({ bridge }: { bridge: Bridge }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [openSession, setOpenSession] = useState<{ project: Project; session: Session } | null>(null);

  useEffect(() => {
    if (bridge.state.kind !== "open") return;
    bridge.request("sessions:list")
      .then((r: any) => setProjects(r.projects))
      .catch((e) => { console.error("[sessions:list] failed", e); setProjects([]); });
  }, [bridge.state.kind]);

  if (openSession) {
    return (
      <SessionView
        bridge={bridge}
        project={openSession.project}
        session={openSession.session}
        onBack={() => setOpenSession(null)}
      />
    );
  }

  if (selected) {
    return (
      <ProjectSessions
        bridge={bridge}
        project={selected}
        onBack={() => setSelected(null)}
        onOpen={(s) => setOpenSession({ project: selected, session: s })}
      />
    );
  }

  if (projects === null) {
    return <LoadingState label="Loading projects" />;
  }
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Folder className="size-6 text-neutral-500" strokeWidth={1.75} />}
        title="No Claude projects"
        body="Once you open a Claude Code session on this Mac, it will show up here."
      />
    );
  }

  // Sort: projects with live sessions first, then by lastModified desc
  const sorted = [...projects].sort((a, b) => {
    if ((b.activeSessionCount ?? 0) - (a.activeSessionCount ?? 0) !== 0) {
      return (b.activeSessionCount ?? 0) - (a.activeSessionCount ?? 0);
    }
    return String(b.lastModified ?? "").localeCompare(String(a.lastModified ?? ""));
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <ul className="px-3 py-2 space-y-1.5">
        {sorted.map((p) => {
          const { name, parent } = splitCwd(p.cwd);
          const live = p.activeSessionCount > 0;
          return (
            <li key={p.id}>
              <button
                onClick={() => setSelected(p)}
                className="w-full text-left rounded-2xl border border-neutral-800/70 bg-neutral-900/50 hover:bg-neutral-900 active:scale-[0.995] transition p-3.5 flex items-center gap-3"
              >
                <div className="relative flex-shrink-0">
                  <div className={`flex size-10 items-center justify-center rounded-xl border ${live ? "border-emerald-400/25 bg-emerald-400/5" : "border-neutral-800 bg-neutral-950"}`}>
                    {live ? (
                      <FolderOpen className="size-5 text-emerald-300" strokeWidth={1.75} />
                    ) : (
                      <Folder className="size-5 text-neutral-500" strokeWidth={1.75} />
                    )}
                  </div>
                  {live && (
                    <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-neutral-900 live-dot" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold tracking-tight truncate">{name}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500 truncate font-mono">{parent}</p>
                  <p className="mt-1 text-[11px] text-neutral-400 tabular-nums">
                    {live ? (
                      <>
                        <span className="text-emerald-300 font-medium">{p.activeSessionCount} live</span>
                        <span className="text-neutral-600"> · </span>
                        <span>{p.sessionCount - p.activeSessionCount} past</span>
                      </>
                    ) : (
                      <>{p.sessionCount} {p.sessionCount === 1 ? "session" : "sessions"}</>
                    )}
                  </p>
                </div>

                <ChevronRight className="size-5 text-neutral-600 flex-shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Split a cwd into displayable name + parent path.
function splitCwd(c: string): { name: string; parent: string } {
  const trimmed = trimCwd(c);
  const parts = trimmed.split("/");
  const name = parts[parts.length - 1] || trimmed;
  const parent = parts.slice(0, -1).join("/") || "";
  return { name, parent };
}
function trimCwd(c: string): string {
  const parts = c.split("/");
  if (c.startsWith("/Users/") && parts.length > 2) return "~/" + parts.slice(3).join("/");
  return c;
}

function ProjectSessions({ bridge, project, onBack, onOpen }: { bridge: Bridge; project: Project; onBack: () => void; onOpen: (s: Session) => void }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { name, parent } = splitCwd(project.cwd);

  useEffect(() => {
    bridge.request("sessions:project", { projectId: project.id, activeOnly: !showAll })
      .then((r: any) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  }, [project.id, showAll]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <SubHeader
        onBack={onBack}
        backLabel="Projects"
        title={name}
        subtitle={parent}
        right={
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300 h-8 px-3 rounded-full hover:bg-sky-400/10 active:bg-sky-400/15 transition"
          >
            {showAll ? "Live only" : "Show all"}
          </button>
        }
      />

      {sessions === null ? (
        <LoadingState label="Loading sessions" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6 text-neutral-500" strokeWidth={1.75} />}
          title={showAll ? "No sessions" : "No live sessions"}
          body={showAll ? "This project has no sessions yet." : "Tap 'Show all' to see past sessions."}
        />
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onOpen(s)}
                className="w-full text-left rounded-2xl border border-neutral-800/70 bg-neutral-900/50 hover:bg-neutral-900 active:scale-[0.995] transition p-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <div className={`flex size-9 items-center justify-center rounded-xl border ${s.active ? "border-emerald-400/25 bg-emerald-400/5" : "border-neutral-800 bg-neutral-950"}`}>
                      <MessageSquare className={`size-4 ${s.active ? "text-emerald-300" : "text-neutral-500"}`} strokeWidth={1.75} />
                    </div>
                    {s.active && (
                      <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-neutral-900 live-dot" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium tracking-tight text-neutral-100 leading-snug line-clamp-2">
                      {s.title}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-neutral-500 tabular-nums">
                      <span className={`inline-flex items-center gap-1 ${s.active ? "text-emerald-300" : "text-neutral-500"}`}>
                        <span className={`size-1.5 rounded-full ${s.active ? "bg-emerald-400" : "bg-neutral-600"}`} />
                        {s.active ? "live" : "closed"}
                      </span>
                      {s.tty && (
                        <span className="inline-flex items-center gap-1">
                          <Hash className="size-3" /> {s.tty}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 ml-auto text-neutral-600">
                        <Clock className="size-3" />
                        {new Date(s.lastModified).toISOString().slice(5, 16).replace("T", " ")}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PAGE_SIZE = 100;
const MAX_IN_MEMORY = 600; // hard cap to keep the DOM light

function SessionView({ bridge, project, session, onBack }: { bridge: Bridge; project: Project; session: Session; onBack: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const preserveScrollRef = useRef<null | { prevScrollHeight: number; prevScrollTop: number }>(null);

  // 1. Initial load: last PAGE_SIZE messages
  useEffect(() => {
    setLoaded(false);
    setMsgs([]);
    setStartIndex(0);
    setEndIndex(0);
    setTotal(0);
    stickToBottomRef.current = true;
    let unsub = () => {};
    (async () => {
      const r: any = await bridge.request("sessions:get", {
        projectId: project.id, sessionId: session.id, limit: PAGE_SIZE,
      });
      setMsgs(r.messages ?? []);
      setStartIndex(r.startIndex ?? 0);
      setEndIndex(r.endIndex ?? (r.messages?.length ?? 0));
      setTotal(r.total ?? (r.messages?.length ?? 0));
      setLoaded(true);
      unsub = bridge.subscribeRequest(
        "sessions:tail:start",
        { projectId: project.id, sessionId: session.id },
        ["sessions:tail:chunk", "sessions:tail:started"],
        (chunk, env) => {
          if (env.type === "sessions:tail:chunk" && Array.isArray(chunk?.messages)) {
            const incoming: Msg[] = chunk.messages;
            setMsgs((prev) => {
              const combined = [...prev, ...incoming];
              if (combined.length > MAX_IN_MEMORY) {
                const drop = combined.length - MAX_IN_MEMORY;
                setStartIndex((s) => s + drop);
                return combined.slice(drop);
              }
              return combined;
            });
            setEndIndex((e) => e + incoming.length);
            setTotal((t) => t + incoming.length);
          }
        },
      );
    })();
    return () => unsub();
  }, [project.id, session.id]);

  useEffect(() => {
    if (!loaded) return;
    stickToBottomRef.current = true;
    let cancelled = false;
    const jump = () => {
      if (cancelled) return;
      bottomAnchorRef.current?.scrollIntoView({ block: "end" });
    };
    jump();
    const timers = [50, 150, 300, 600, 1000, 1600].map((ms) => setTimeout(jump, ms));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [loaded]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  useLayoutEffect(() => {
    if (!preserveScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const { prevScrollHeight, prevScrollTop } = preserveScrollRef.current;
    el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
    preserveScrollRef.current = null;
  }, [startIndex]);

  async function loadOlder() {
    if (loadingOlder || startIndex <= 0) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    if (el) preserveScrollRef.current = { prevScrollHeight: el.scrollHeight, prevScrollTop: el.scrollTop };
    try {
      const r: any = await bridge.request("sessions:get", {
        projectId: project.id, sessionId: session.id, limit: PAGE_SIZE, cursor: startIndex,
      });
      const older: Msg[] = r.messages ?? [];
      if (older.length > 0) {
        setMsgs((prev) => {
          const combined = [...older, ...prev];
          if (combined.length > MAX_IN_MEMORY) {
            const drop = combined.length - MAX_IN_MEMORY;
            setEndIndex((e) => e - drop);
            return combined.slice(0, MAX_IN_MEMORY);
          }
          return combined;
        });
        setStartIndex(r.startIndex ?? Math.max(0, startIndex - older.length));
      }
    } catch (e) {
      console.error("[sessions:get older] failed", e);
    } finally {
      setLoadingOlder(false);
    }
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = nearBottom;
    if (el.scrollTop < 200 && startIndex > 0 && !loadingOlder && loaded) {
      void loadOlder();
    }
  }

  async function sendPrompt() {
    if (!input.trim() || sending) return;
    setSendErr(null);
    setSending(true);
    try {
      const r: any = await bridge.request("sessions:send", { projectId: project.id, sessionId: session.id, text: input });
      if (!r.ok) {
        setSendErr(r.error ?? "Send failed.");
        setSending(false);
        return;
      }
      setInput("");
    } catch (e: any) {
      setSendErr(e?.message ?? "Send failed.");
    }
    setSending(false);
  }

  const canSend = session.active && !!input.trim() && !sending;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-900/80 flex items-center">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-0.5 h-11 pl-2 pr-3 text-sky-400 hover:bg-sky-400/10 active:bg-sky-400/15 text-[15px] font-medium transition"
        >
          <ChevronLeft className="size-5" strokeWidth={2.25} />
          Sessions
        </button>
        <div className="min-w-0 flex-1 py-2 pr-3">
          <p className="text-[13px] font-medium text-neutral-100 leading-snug truncate">{session.title}</p>
          <p className="text-[10px] text-neutral-500 tabular-nums truncate">
            <span className={session.active ? "text-emerald-300" : ""}>{session.active ? "live" : "closed"}</span>
            {session.tty ? <> <span className="text-neutral-700">·</span> {session.tty}</> : null}
            {loaded ? <> <span className="text-neutral-700">·</span> {startIndex + 1}-{endIndex} of {total}</> : null}
          </p>
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {!loaded && <LoadingState label="Loading transcript" inline />}
        {loaded && msgs.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-10">Empty session.</p>
        )}
        {startIndex > 0 && (
          <div className="text-center py-2">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-50 h-8 px-3 rounded-full border border-neutral-800 bg-neutral-900/60"
            >
              {loadingOlder ? "loading older" : `Load older (${startIndex} more)`}
            </button>
          </div>
        )}
        <div className="space-y-2.5">
          {msgs.map((m, i) => <MessageRow key={`${startIndex + i}`} m={m} />)}
        </div>
        <div ref={bottomAnchorRef} aria-hidden />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void sendPrompt(); }}
        className="border-t border-neutral-900/80 bg-neutral-950/90 backdrop-blur-xl px-2 pt-2 pb-2 flex-shrink-0"
      >
        {sendErr && (
          <p className="mx-2 mb-1.5 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1 text-[11px] text-red-300">
            {sendErr}
          </p>
        )}
        <div className="flex gap-2 items-end">
          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendPrompt(); } }}
              placeholder={session.active ? "Message this claude session" : "Session closed"}
              rows={1}
              disabled={!session.active || sending}
              className="w-full resize-none rounded-3xl bg-neutral-900 border border-neutral-800 pl-4 pr-4 py-3 text-[15px] leading-snug outline-none focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10 disabled:opacity-50 max-h-40 placeholder:text-neutral-600"
            />
          </div>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={`flex-shrink-0 inline-flex items-center justify-center size-11 rounded-full transition active:scale-90 ${
              canSend ? "bg-sky-400 text-neutral-950 shadow-lg shadow-sky-500/20" : "bg-neutral-800 text-neutral-600"
            }`}
          >
            <ArrowUp className="size-5" strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Message rendering ---------------------------------------------------

function MessageRow({ m }: { m: Msg }) {
  const role = m.role ?? m.type;
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isTool = !!m.toolName || (!isUser && !isAssistant);

  if (isTool) return <ToolBubble m={m} />;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-sky-400 text-neutral-950 px-3.5 py-2 shadow-lg shadow-sky-500/10">
          <MessageBody m={m} monoDefault={false} onDark />
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-neutral-900/80 border border-neutral-800 text-neutral-100 px-3.5 py-2.5">
        <MessageBody m={m} monoDefault={false} />
      </div>
    </div>
  );
}

function ToolBubble({ m }: { m: Msg }) {
  const [open, setOpen] = useState(false);
  const label = m.toolName ?? (m.role ?? m.type);
  const preview = firstLine(m.text ?? m.summary ?? "");
  const hasBody = !!(m.text || m.summary);

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-full">
        <button
          onClick={() => hasBody && setOpen(!open)}
          disabled={!hasBody}
          className={`w-full inline-flex items-center gap-2 rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-2.5 py-1.5 text-left ${
            hasBody ? "hover:bg-neutral-900/60 active:scale-[0.995] transition" : "cursor-default"
          }`}
        >
          <Wrench className="size-3.5 text-amber-400/80 flex-shrink-0" strokeWidth={2} />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 flex-shrink-0">{label}</span>
          {preview && (
            <span className="text-[12px] text-neutral-500 truncate font-mono">
              {preview}
            </span>
          )}
          {hasBody && (
            <ChevronRight
              className={`ml-auto size-4 text-neutral-600 transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`}
            />
          )}
        </button>
        {open && (
          <div className="mt-1.5 rounded-xl bg-neutral-950 border border-neutral-800 p-3">
            <MessageBody m={m} monoDefault />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBody({ m, monoDefault, onDark }: { m: Msg; monoDefault: boolean; onDark?: boolean }) {
  const textClass = monoDefault
    ? `text-[12.5px] whitespace-pre-wrap font-mono ${onDark ? "text-neutral-950" : "text-neutral-100"} break-words leading-relaxed`
    : `text-[14px] whitespace-pre-wrap ${onDark ? "text-neutral-950" : "text-neutral-100"} break-words leading-relaxed`;
  return (
    <>
      {m.text && <pre className={textClass}>{m.text}</pre>}
      {m.summary && !m.text && (
        <p className={`text-[13px] italic ${onDark ? "text-neutral-800" : "text-neutral-300"}`}>{m.summary}</p>
      )}
      {m.summary && m.text && (
        <p className={`mt-1 text-[11px] italic ${onDark ? "text-neutral-800" : "text-neutral-500"}`}>{m.summary}</p>
      )}
    </>
  );
}

function firstLine(s: string): string {
  const line = s.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 80 ? line.slice(0, 80) + "…" : line;
}

// ---- Shared sub-header + generic states ---------------------------------

export function SubHeader({
  onBack,
  backLabel,
  title,
  subtitle,
  right,
}: {
  onBack: () => void;
  backLabel: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-900/80 flex items-center">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-0.5 h-11 pl-2 pr-2.5 text-sky-400 hover:bg-sky-400/10 active:bg-sky-400/15 text-[15px] font-medium transition"
      >
        <ChevronLeft className="size-5" strokeWidth={2.25} />
        {backLabel}
      </button>
      <div className="min-w-0 flex-1 py-2 pr-3">
        <p className="text-[13px] font-medium text-neutral-100 truncate leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] text-neutral-500 truncate font-mono">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function LoadingState({ label, inline }: { label: string; inline?: boolean }) {
  if (inline) {
    return (
      <p className="text-sm text-neutral-500 text-center py-8 inline-flex items-center gap-2 justify-center w-full">
        <span className="size-1.5 rounded-full bg-neutral-500 animate-pulse" />
        {label}
      </p>
    );
  }
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-neutral-500 inline-flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-neutral-500 animate-pulse" />
        {label}
      </p>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/60">
          {icon}
        </div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-neutral-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
