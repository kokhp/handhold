"use client";

import { useEffect, useState } from "react";
import type { Bridge } from "@/lib/use-bridge";

type CmuxStatus = { socketExists: boolean; passwordSet: boolean; ok: boolean; hint?: string };

export function TerminalsTab({ bridge }: { bridge: Bridge }) {
  const [status, setStatus] = useState<CmuxStatus | null>(null);
  const [tree, setTree] = useState<any>(null);
  const [scrollback, setScrollback] = useState<{ target: string; content: string } | null>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (bridge.state.kind !== "open") return;
    bridge.request("cmux:list").then((r: any) => { setStatus(r.status); setTree(r.tree); }).catch(() => setStatus({ socketExists: false, passwordSet: false, ok: false, hint: "bridge error" }));
  }, [bridge.state.kind]);

  if (!status) return <div className="p-6 text-neutral-500 text-sm">Loading terminals…</div>;

  if (!status.ok) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-4xl">🖥</div>
        <h2 className="font-medium">cmux not ready</h2>
        <p className="text-sm text-neutral-500 whitespace-pre-line">{status.hint}</p>
        <div className="text-xs text-neutral-600 mt-4 space-y-1">
          <p>Socket file: <code>{status.socketExists ? "✓ found" : "not found"}</code></p>
          <p>Password: <code>{status.passwordSet ? "✓ set" : "not set"}</code></p>
        </div>
      </div>
    );
  }

  if (scrollback) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-2 text-xs text-neutral-500 border-b border-neutral-900 flex items-center gap-2">
          <button onClick={() => setScrollback(null)} className="text-neutral-300">‹ Panes</button>
          <span className="font-mono truncate">{scrollback.target}</span>
        </div>
        <pre className="flex-1 overflow-auto p-3 text-[12px] font-mono whitespace-pre-wrap break-words">{scrollback.content || "(empty)"}</pre>
        <form
          onSubmit={async (e) => { e.preventDefault(); if (!input) return; await bridge.request("cmux:write", { target: scrollback.target, text: input, submit: true }); setInput(""); const r: any = await bridge.request("cmux:read", { target: scrollback.target }); setScrollback({ target: scrollback.target, content: r.content ?? "" }); }}
          className="p-2 border-t border-neutral-900 flex gap-2"
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="type + return to send" className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-600" />
          <button className="rounded-lg bg-white text-black px-3 py-2 text-sm font-medium">Send</button>
        </form>
      </div>
    );
  }

  const panes = flattenPanes(tree);
  if (panes.length === 0) return <div className="p-6 text-neutral-500 text-sm">No cmux panes.</div>;

  return (
    <ul className="divide-y divide-neutral-900">
      {panes.map((p) => (
        <li key={p.ref}>
          <button
            onClick={async () => { const r: any = await bridge.request("cmux:read", { target: p.ref }); setScrollback({ target: p.ref, content: r.content ?? "" }); }}
            className="w-full text-left px-4 py-3.5 hover:bg-neutral-900/50 active:bg-neutral-900"
          >
            <p className="font-medium truncate">{p.title || p.ref}</p>
            <p className="text-xs text-neutral-500 truncate">
              {[p.workspace, p.type, p.tty].filter(Boolean).join(" · ")}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

// cmux tree = windows > workspaces > panes > surfaces. Each surface is one
// terminal tab (has ref, title, tty, type). We flatten to a list of surfaces.
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
