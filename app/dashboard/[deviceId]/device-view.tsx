"use client";

import Link from "next/link";
import { useState } from "react";
import { useBridge } from "@/lib/use-bridge";
import { SessionsTab } from "./sessions-tab";
import { TerminalsTab } from "./terminals-tab";
import { BrowserTab } from "./browser-tab";

type Tab = "sessions" | "terminals" | "browser";

export function DeviceView({ deviceId, deviceName, paired }: { deviceId: string; deviceName: string; paired: boolean }) {
  const bridge = useBridge(paired ? deviceId : null);
  const [tab, setTab] = useState<Tab>("sessions");

  const dot =
    bridge.state.kind === "open" ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/50" :
    bridge.state.kind === "device-offline" ? "bg-neutral-600" :
    "bg-amber-400 animate-pulse";

  const statusLabel =
    bridge.state.kind === "open" ? "online" :
    bridge.state.kind === "device-offline" ? "offline" :
    bridge.state.kind === "connecting" ? "connecting…" :
    "disconnected";

  return (
    <div className="min-h-svh flex flex-col bg-neutral-950">
      {/* Sticky header: stays visible while any tab content scrolls */}
      <header className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur pt-safe border-b border-neutral-900">
        <div className="px-4 pt-2 pb-2 flex items-center gap-3">
          <Link href="/dashboard" className="text-neutral-300 hover:text-white text-2xl leading-none px-1 -ml-1">‹</Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Mac</p>
            <h1 className="text-base font-semibold truncate">{deviceName}</h1>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span className={`inline-block size-2 rounded-full ${dot}`} />
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {!paired ? (
          <div className="p-6 text-center text-neutral-500">Waiting for this Mac to be paired.</div>
        ) : bridge.state.kind === "device-offline" ? (
          <div className="p-6 text-center text-neutral-500">
            The bridge on this Mac is not running.<br />
            Start it with <code className="text-neutral-300">handhold install-agent</code> on your Mac.
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {tab === "sessions" && <SessionsTab bridge={bridge} />}
            {tab === "terminals" && <TerminalsTab bridge={bridge} />}
            {tab === "browser" && <BrowserTab bridge={bridge} />}
          </div>
        )}
      </div>

      <nav className="sticky bottom-0 z-30 grid grid-cols-3 border-t border-neutral-900 bg-neutral-950/95 backdrop-blur pb-safe">
        {(["sessions", "terminals", "browser"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3.5 text-sm font-medium ${tab === t ? "text-white" : "text-neutral-500"}`}
          >
            {t === "sessions" ? "🤖 Claude" : t === "terminals" ? "🖥 Terminals" : "🌐 Browser"}
          </button>
        ))}
      </nav>
    </div>
  );
}
