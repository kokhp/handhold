"use client";

import { useEffect, useState } from "react";
import type { Bridge } from "@/lib/use-bridge";

type Tab = { id: string; title: string; url: string; faviconUrl?: string };

export function BrowserTab({ bridge }: { bridge: Bridge }) {
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const r: any = await bridge.request("browser:tabs");
      if (r.ok) { setTabs(r.tabs); return; }
      setError(r.error ?? "Chrome debug port not reachable");
      setTabs([]);
    } catch (e: any) { setError(e.message); setTabs([]); }
  }

  async function launchDebug() {
    setLaunching(true);
    setError(null);
    try {
      const r: any = await bridge.request("browser:launch-debug", undefined, 15000);
      if (!r.ok) setError(r.error ?? "launch failed");
      else await refresh();
    } catch (e: any) { setError(e.message); }
    setLaunching(false);
  }

  useEffect(() => { if (bridge.state.kind === "open") refresh(); }, [bridge.state.kind]);

  if (tabs === null) return <div className="p-6 text-neutral-500 text-sm">Loading tabs…</div>;

  if (tabs.length === 0) {
    return (
      <div className="p-6 space-y-4 overflow-y-auto">
        <div className="text-4xl">🌐</div>
        <h2 className="font-medium">Chrome debug port not reachable</h2>
        <p className="text-sm text-neutral-500">
          To let handhold see your Chrome tabs, we need to relaunch Chrome with a debug flag. This will quit Chrome and reopen it, restoring your tabs.
        </p>
        <button
          onClick={launchDebug}
          disabled={launching}
          className="w-full rounded-xl bg-white text-black font-medium py-3.5 disabled:opacity-50 active:scale-[0.99] transition"
        >
          {launching ? "Restarting Chrome…" : "Launch Chrome with debug port"}
        </button>
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer text-neutral-400">or run manually</summary>
          <pre className="mt-2 bg-neutral-900 p-3 rounded-lg font-mono break-all whitespace-pre-wrap">open -na "Google Chrome" --args --remote-debugging-port=9222</pre>
        </details>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button onClick={refresh} className="w-full rounded-xl bg-neutral-900 border border-neutral-800 py-3 text-sm">Retry</button>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-neutral-900 overflow-y-auto">
      {tabs.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3">
          {t.faviconUrl ? <img src={t.faviconUrl} alt="" className="size-4 rounded" /> : <span className="size-4 rounded bg-neutral-700" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{t.title || "(untitled)"}</p>
            <p className="text-[11px] text-neutral-500 truncate">{t.url}</p>
          </div>
          <button
            disabled={busy === t.id}
            onClick={async () => { setBusy(t.id); await bridge.request("browser:activate", { tabId: t.id }); setBusy(null); }}
            className="text-xs bg-neutral-800 rounded-md px-2 py-1 disabled:opacity-50"
          >
            {busy === t.id ? "…" : "Focus"}
          </button>
          <button
            disabled={busy === t.id}
            onClick={async () => { if (!confirm("Close this tab?")) return; setBusy(t.id); await bridge.request("browser:close", { tabId: t.id }); await refresh(); setBusy(null); }}
            className="text-xs text-neutral-500 hover:text-red-400"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
