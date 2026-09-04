"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

  if (projects === null) return <div className="p-6 text-neutral-500 text-sm">Loading projects…</div>;
  if (projects.length === 0) return <div className="p-6 text-neutral-500 text-sm">No Claude Code projects found.</div>;

  return (
    <ul className="divide-y divide-neutral-900 overflow-y-auto">
      {projects.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => setSelected(p)}
            className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-neutral-900"
          >
            <span className={`inline-block size-2 rounded-full ${p.activeSessionCount > 0 ? "bg-emerald-400" : "bg-neutral-700"}`} />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{trimCwd(p.cwd)}</p>
              <p className="text-xs text-neutral-500 truncate">
                {p.activeSessionCount > 0
                  ? `${p.activeSessionCount} live · ${p.sessionCount - p.activeSessionCount} past`
                  : `${p.sessionCount} past session${p.sessionCount === 1 ? "" : "s"}`}
              </p>
            </div>
            <span className="text-neutral-600">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function trimCwd(c: string): string {
  const parts = c.split("/");
  if (c.startsWith("/Users/") && parts.length > 2) return "~/" + parts.slice(3).join("/");
  return c;
}

function ProjectSessions({ bridge, project, onBack, onOpen }: { bridge: Bridge; project: Project; onBack: () => void; onOpen: (s: Session) => void }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    bridge.request("sessions:project", { projectId: project.id, activeOnly: !showAll })
      .then((r: any) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  }, [project.id, showAll]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur px-4 py-2 text-xs text-neutral-500 border-b border-neutral-900 flex items-center gap-3">
        <button onClick={onBack} className="text-neutral-200 -ml-1 px-1">‹ Projects</button>
        <span className="truncate flex-1">{trimCwd(project.cwd)}</span>
        <button onClick={() => setShowAll(!showAll)} className="text-neutral-400 underline underline-offset-4">
          {showAll ? "live only" : "show all"}
        </button>
      </div>
      {sessions === null ? (
        <div className="p-6 text-neutral-500 text-sm">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="p-6 text-neutral-500 text-sm">
          {showAll ? "No sessions in this project." : "No live sessions. Tap 'show all' to see past sessions."}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-900 overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id}>
              <button onClick={() => onOpen(s)} className="w-full text-left px-4 py-3.5 active:bg-neutral-900 flex items-start gap-3">
                <span className={`mt-1.5 inline-block size-2 rounded-full flex-shrink-0 ${s.active ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/50" : "bg-neutral-700"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {s.active ? "live" : "closed"} · {new Date(s.lastModified).toISOString().slice(0, 16).replace("T", " ")} UTC
                    {s.tty ? ` · ${s.tty}` : ""}
                  </p>
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
  // Windowed transcript state: we keep messages [startIndex, endIndex) from the
  // full transcript in memory, plus totalMessages we know about server-side.
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
      // Live tail: append new lines as they're written
      unsub = bridge.subscribeRequest(
        "sessions:tail:start",
        { projectId: project.id, sessionId: session.id },
        ["sessions:tail:chunk", "sessions:tail:started"],
        (chunk, env) => {
          if (env.type === "sessions:tail:chunk" && Array.isArray(chunk?.messages)) {
            const incoming: Msg[] = chunk.messages;
            setMsgs((prev) => {
              const combined = [...prev, ...incoming];
              // Cap in-memory count from the older end so DOM stays small
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

  // 2. Scroll to bottom after initial paint. Observing scrollHeight is the
  //    reliable way — raf timing races because tool-result <pre> blocks lay out
  //    lazily, so scrollHeight keeps growing after mount. We stick to bottom
  //    for up to 1s while content settles, then release.
  useEffect(() => {
    if (!loaded) return;
    const el = scrollRef.current;
    if (!el) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    // Force scroll immediately, then repeatedly for ~1s to catch layout shifts.
    const pin = () => { if (!cancelled && el) el.scrollTop = el.scrollHeight; };
    pin();
    const rafId = requestAnimationFrame(pin);
    const timer = setTimeout(pin, 100);
    const timer2 = setTimeout(pin, 400);
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => { if (stickToBottomRef.current) pin(); });
      observer.observe(el);
    }
    const release = setTimeout(() => { stickToBottomRef.current = true; }, 50);
    const stopObs = setTimeout(() => { observer?.disconnect(); observer = null; }, 1200);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timer); clearTimeout(timer2); clearTimeout(release); clearTimeout(stopObs);
      observer?.disconnect();
    };
  }, [loaded]);

  // 3. Auto-scroll on tail chunks IF user was already near bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  // 4. After prepending older messages, restore the pixel scroll position so
  //    the user's viewport doesn't jump.
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
    // Snapshot scroll so we can restore after prepend
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
            // Trim from the tail (newest) — no, actually trim tail if we're now scrolling up
            // But since we're paging older, keep the older we just added and drop from tail.
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
    // If user scrolls near the top and there is more history, fetch older.
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

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur px-4 py-2 text-xs text-neutral-500 border-b border-neutral-900 flex items-center gap-3">
        <button onClick={onBack} className="text-neutral-200 -ml-1 px-1">‹ Sessions</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-neutral-300">{session.title}</p>
          <p className="text-[10px] text-neutral-600 truncate">
            {session.active ? "live" : "closed"}
            {session.tty ? ` · ${session.tty}` : ""}
            {loaded ? ` · showing ${startIndex + 1}–${endIndex} of ${total}` : ""}
          </p>
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {!loaded && <p className="text-sm text-neutral-500">Loading transcript…</p>}
        {loaded && msgs.length === 0 && <p className="text-sm text-neutral-500">Empty session.</p>}
        {startIndex > 0 && (
          <div className="text-center py-2">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-xs text-neutral-400 underline underline-offset-4 disabled:opacity-50"
            >
              {loadingOlder ? "loading older…" : `Load older (${startIndex} more)`}
            </button>
          </div>
        )}
        {msgs.map((m, i) => <MessageRow key={`${startIndex + i}`} m={m} />)}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void sendPrompt(); }}
        className="border-t border-neutral-900 bg-neutral-950/95 backdrop-blur p-2 space-y-1 flex-shrink-0"
      >
        {sendErr && <p className="px-2 text-[11px] text-red-400">{sendErr}</p>}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendPrompt(); } }}
            placeholder={session.active ? "Type a message to this claude session…" : "Session closed"}
            rows={1}
            disabled={!session.active || sending}
            className="flex-1 resize-none rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-sm outline-none focus:border-neutral-600 disabled:opacity-50 max-h-32"
          />
          <button
            type="submit"
            disabled={!session.active || sending || !input.trim()}
            className="rounded-xl bg-white text-black px-4 py-2.5 text-sm font-medium disabled:opacity-40 active:scale-95 transition"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageRow({ m }: { m: Msg }) {
  const role = m.role ?? m.type;
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const color = isUser ? "bg-blue-950/50 border-blue-900/60" : isAssistant ? "bg-neutral-900 border-neutral-800" : "bg-amber-950/30 border-amber-900/50";
  const label = m.toolName ? `${role}: ${m.toolName}` : role;
  return (
    <div className={`rounded-xl border ${color} p-3`}>
      <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">{label}</p>
      {m.text && <pre className="text-[13px] whitespace-pre-wrap font-mono text-neutral-100 break-words">{m.text}</pre>}
      {m.summary && <p className="text-sm italic text-neutral-300">{m.summary}</p>}
    </div>
  );
}
