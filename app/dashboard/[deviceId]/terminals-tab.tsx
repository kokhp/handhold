"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  ChevronLeft,
  Layers,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import type { Bridge } from "@/lib/use-bridge";

type CmuxStatus = { socketExists: boolean; passwordSet: boolean; ok: boolean; hint?: string };

export function TerminalsTab({ bridge }: { bridge: Bridge }) {
  const [status, setStatus] = useState<CmuxStatus | null>(null);
  const [tree, setTree] = useState<any>(null);
  const [scrollback, setScrollback] = useState<{ target: string; content: string } | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function refresh() {
    try {
      const r: any = await bridge.request("cmux:list");
      setStatus(r.status);
      setTree(r.tree);
    } catch {
      setStatus({ socketExists: false, passwordSet: false, ok: false, hint: "bridge error" });
    }
  }

  useEffect(() => {
    if (bridge.state.kind !== "open") return;
    refresh();
  }, [bridge.state.kind]);

  if (!status) {
    return (
      <p className="flex-1 flex items-center justify-center text-sm text-neutral-500 gap-2">
        <span className="size-1.5 rounded-full bg-neutral-500 animate-pulse" />
        Loading terminals
      </p>
    );
  }

  if (!status.ok) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-sm mx-auto text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/5">
            <AlertTriangle className="size-6 text-amber-400" strokeWidth={1.75} />
          </div>
          <h2 className="text-base font-semibold tracking-tight">cmux not ready</h2>
          <p className="mt-2 text-sm text-neutral-500 whitespace-pre-line leading-relaxed">
            {status.hint}
          </p>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3 text-left space-y-2">
            <StatusRow label="Socket file" ok={status.socketExists} okText="found" badText="not found" />
            <StatusRow label="Password" ok={status.passwordSet} okText="set" badText="not set" />
          </div>

          <button
            onClick={refresh}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 py-2.5 px-4 text-sm font-medium active:scale-[0.98] transition"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (scrollback) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-900/80 flex items-center">
          <button
            onClick={() => setScrollback(null)}
            className="inline-flex items-center gap-0.5 h-11 pl-2 pr-2.5 text-sky-400 hover:bg-sky-400/10 active:bg-sky-400/15 text-[15px] font-medium transition"
          >
            <ChevronLeft className="size-5" strokeWidth={2.25} />
            Panes
          </button>
          <div className="min-w-0 flex-1 py-2 pr-3">
            <p className="font-mono text-[12px] text-neutral-300 truncate">{scrollback.target}</p>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-3 text-[12px] font-mono whitespace-pre-wrap break-words text-neutral-100 bg-neutral-950">
          {scrollback.content || "(empty)"}
        </pre>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!input || sending) return;
            setSending(true);
            try {
              await bridge.request("cmux:write", { target: scrollback.target, text: input, submit: true });
              setInput("");
              const r: any = await bridge.request("cmux:read", { target: scrollback.target });
              setScrollback({ target: scrollback.target, content: r.content ?? "" });
            } finally {
              setSending(false);
            }
          }}
          className="border-t border-neutral-900/80 bg-neutral-950/90 backdrop-blur-xl p-2 flex gap-2 items-end"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type and send"
            className="flex-1 rounded-full bg-neutral-900 border border-neutral-800 px-4 py-2.5 text-[15px] outline-none focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10 placeholder:text-neutral-600 font-mono"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!input || sending}
            className={`flex-shrink-0 inline-flex items-center justify-center size-11 rounded-full transition active:scale-90 ${
              input && !sending ? "bg-sky-400 text-neutral-950 shadow-lg shadow-sky-500/20" : "bg-neutral-800 text-neutral-600"
            }`}
          >
            <ArrowUp className="size-5" strokeWidth={2.5} />
          </button>
        </form>
      </div>
    );
  }

  const panes = flattenPanes(tree);
  if (panes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-xs text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/60">
            <TerminalSquare className="size-6 text-neutral-500" strokeWidth={1.75} />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">No cmux panes</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Open cmux on your Mac and any pane will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
      {panes.map((p) => (
        <li key={p.ref}>
          <button
            onClick={async () => {
              const r: any = await bridge.request("cmux:read", { target: p.ref });
              setScrollback({ target: p.ref, content: r.content ?? "" });
            }}
            className="w-full text-left rounded-2xl border border-neutral-800/70 bg-neutral-900/50 hover:bg-neutral-900 active:scale-[0.995] transition p-3.5 flex items-center gap-3"
          >
            <div className="flex-shrink-0 flex size-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950">
              <TerminalSquare className="size-5 text-neutral-300" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold tracking-tight truncate">{p.title || p.ref}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500 truncate font-mono">
                {[p.workspace, p.type, p.tty].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Layers className="size-4 text-neutral-600 flex-shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusRow({ label, ok, okText, badText }: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-mono ${ok ? "text-emerald-300" : "text-red-300"}`}>
        <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
        {ok ? okText : badText}
      </span>
    </div>
  );
}

function flattenPanes(tree: any): Array<{ ref: string; title: string; workspace: string; tty?: string; type?: string }> {
  const out: Array<{ ref: string; title: string; workspace: string; tty?: string; type?: string }> = [];
  if (!tree || typeof tree !== "object") return [];
  for (const win of tree.windows ?? []) {
    for (const ws of win.workspaces ?? []) {
      const wsName = ws.title ?? ws.name ?? "";
      for (const pane of ws.panes ?? []) {
        for (const surface of pane.surfaces ?? []) {
          out.push({
            ref: surface.ref,
            title: surface.title ?? "",
            workspace: wsName,
            tty: surface.tty,
            type: surface.type,
          });
        }
      }
    }
  }
  return out;
}
