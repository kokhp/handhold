"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Globe,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
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

  if (tabs === null) {
    return (
      <p className="flex-1 flex items-center justify-center text-sm text-neutral-500 gap-2">
        <span className="size-1.5 rounded-full bg-neutral-500 animate-pulse" />
        Loading tabs
      </p>
    );
  }

  if (tabs.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-sm mx-auto text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-400/5">
            <Globe className="size-6 text-sky-400" strokeWidth={1.75} />
          </div>
          <h2 className="text-base font-semibold tracking-tight">Chrome not connected</h2>
          <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
            To let handhold see your tabs, we need to relaunch Chrome with a debug flag. Your tabs will be restored.
          </p>

          <button
            onClick={launchDebug}
            disabled={launching}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black font-semibold py-3.5 disabled:opacity-50 active:scale-[0.98] transition"
          >
            {launching ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" strokeWidth={2.5} />}
            {launching ? "Restarting Chrome" : "Launch Chrome with debug port"}
          </button>

          <details className="mt-5 text-left">
            <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300 inline-flex items-center gap-1.5 group">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-0 -rotate-90" />
              Or run manually
            </summary>
            <pre className="mt-2 bg-neutral-950 border border-neutral-800 rounded-xl p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-neutral-300">
{`open -na "Google Chrome" \\
  --args --remote-debugging-port=9222`}
            </pre>
          </details>

          {error && (
            <p className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            onClick={refresh}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 py-2 px-4 text-sm active:scale-[0.98] transition"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[11px] text-neutral-500 tabular-nums">
          {tabs.length} {tabs.length === 1 ? "tab" : "tabs"}
        </p>
        <button
          onClick={refresh}
          aria-label="Refresh"
          className="inline-flex items-center justify-center size-8 rounded-full text-neutral-500 hover:text-neutral-100 hover:bg-neutral-900 active:scale-95 transition"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {tabs.map((t) => (
          <li key={t.id} className="rounded-2xl border border-neutral-800/70 bg-neutral-900/50 overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <div className="flex-shrink-0 flex size-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950">
                {t.faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.faviconUrl} alt="" className="size-4 rounded" />
                ) : (
                  <Globe className="size-4 text-neutral-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate leading-snug">{t.title || "(untitled)"}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500 truncate font-mono">{prettyUrl(t.url)}</p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1">
                <button
                  disabled={busy === t.id}
                  onClick={async () => { setBusy(t.id); await bridge.request("browser:activate", { tabId: t.id }); setBusy(null); }}
                  aria-label="Focus"
                  className="inline-flex items-center justify-center size-9 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 active:scale-95 transition disabled:opacity-50"
                >
                  {busy === t.id ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                </button>
                <button
                  disabled={busy === t.id}
                  onClick={async () => {
                    if (!confirm("Close this tab?")) return;
                    setBusy(t.id);
                    await bridge.request("browser:close", { tabId: t.id });
                    await refresh();
                    setBusy(null);
                  }}
                  aria-label="Close tab"
                  className="inline-flex items-center justify-center size-9 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 active:scale-95 transition"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function prettyUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return u;
  }
}
