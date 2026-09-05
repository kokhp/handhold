"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, ChevronLeft, Globe, TerminalSquare } from "lucide-react";
import { useBridge } from "@/lib/use-bridge";
import { SessionsTab } from "./sessions-tab";
import { TerminalsTab } from "./terminals-tab";
import { BrowserTab } from "./browser-tab";

type Tab = "sessions" | "terminals" | "browser";

export function DeviceView({ deviceId, deviceName, paired }: { deviceId: string; deviceName: string; paired: boolean }) {
  const bridge = useBridge(paired ? deviceId : null);
  const [tab, setTab] = useState<Tab>("sessions");

  const status: "online" | "connecting" | "offline" =
    bridge.state.kind === "open" ? "online" :
    bridge.state.kind === "device-offline" ? "offline" :
    "connecting";

  return (
    <div className="h-svh flex flex-col bg-neutral-950 overflow-hidden">
      {/* Fixed viewport height so nested flex-1 min-h-0 scroll areas actually
          scroll instead of pushing the whole page. Sticky header + bottom nav
          are inside this bounded box. */}
      <header className="flex-shrink-0 bg-neutral-950/90 backdrop-blur-xl pt-safe border-b border-neutral-900/80">
        <div className="px-4 pt-1 pb-3 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-0.5 -ml-1.5 h-9 pl-1 pr-2.5 rounded-full text-sky-400 hover:bg-sky-400/10 active:bg-sky-400/15 transition text-[15px] font-medium"
          >
            <ChevronLeft className="size-5" strokeWidth={2.25} />
            Macs
          </Link>
          <div className="min-w-0 flex-1" />
          <StatusIndicator status={status} />
        </div>
        <div className="px-5 pb-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-500">Mac</p>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight truncate">{deviceName}</h1>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {!paired ? (
          <EmptyMessage title="Not paired yet" body="Waiting for this Mac to be paired." />
        ) : bridge.state.kind === "device-offline" ? (
          <EmptyMessage
            title="Bridge offline"
            body={
              <>
                The handhold bridge on this Mac is not running. Start it with{" "}
                <code className="rounded bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 text-neutral-200 text-[12px]">handhold install-agent</code>.
              </>
            }
          />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {tab === "sessions" && <SessionsTab bridge={bridge} />}
            {tab === "terminals" && <TerminalsTab bridge={bridge} />}
            {tab === "browser" && <BrowserTab bridge={bridge} />}
          </div>
        )}
      </div>

      <nav className="relative flex-shrink-0 grid grid-cols-3 border-t border-neutral-900/80 bg-neutral-950/90 backdrop-blur-xl pb-safe">
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-label={t.label}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 pt-3 text-[10px] font-medium tracking-wide transition active:scale-95 ${
                active ? "text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-sky-400"
                  aria-hidden
                />
              )}
              <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

const TABS: { key: Tab; label: string; icon: typeof Bot }[] = [
  { key: "sessions", label: "Claude", icon: Bot },
  { key: "terminals", label: "Terminals", icon: TerminalSquare },
  { key: "browser", label: "Browser", icon: Globe },
];

function StatusIndicator({ status }: { status: "online" | "connecting" | "offline" }) {
  const { dot, label, wrap } = {
    online: {
      dot: "bg-emerald-400 live-dot",
      label: "live",
      wrap: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    },
    offline: {
      dot: "bg-neutral-600",
      label: "offline",
      wrap: "bg-neutral-800/60 text-neutral-400 border-neutral-700/60",
    },
    connecting: {
      dot: "bg-amber-400 animate-pulse",
      label: "connecting",
      wrap: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${wrap}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function EmptyMessage({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xs text-center">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-1.5 text-sm text-neutral-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
