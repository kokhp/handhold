"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Loader2,
  Monitor,
  Plus,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

// Stable format on server + client to avoid hydration mismatch from toLocaleString.
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min} UTC`;
}

// Client-only relative time. Avoids SSR hydration mismatch by returning a stable
// placeholder until mounted.
function useRelative(iso: string | null): string {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!iso || now === null) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type Device = {
  id: string;
  name: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  paired: boolean;
};

export function DevicesPanel({ initialDevices }: { initialDevices: Device[] }) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string; deviceId: string } | null>(null);
  const [pairErr, setPairErr] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);

  // Poll device list every 5s so a fresh pair appears without a page refresh.
  useEffect(() => {
    const t = setInterval(refresh, 5_000);
    return () => clearInterval(t);
  }, []);

  async function refresh() {
    const res = await fetch("/api/devices", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setDevices(data.devices);
  }

  // For each paired device, keep one WebSocket subscription open. When any
  // device is added/removed, adjust the pool.
  const socketsRef = useRef<Map<string, WebSocket>>(new Map());
  useEffect(() => {
    const pool = socketsRef.current;
    const wanted = new Set(devices.filter((d) => d.paired).map((d) => d.id));
    // Close removed
    for (const [id, ws] of pool) {
      if (!wanted.has(id)) {
        try { ws.close(); } catch {}
        pool.delete(id);
      }
    }
    // Open new
    for (const id of wanted) {
      if (pool.has(id)) continue;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/api/mobile?device=${encodeURIComponent(id)}`);
      pool.set(id, ws);
      ws.addEventListener("message", (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg.type === "device:online") {
            setOnlineIds((prev) => new Set(prev).add(id));
          } else if (msg.type === "device:offline") {
            setOnlineIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch {}
      });
      ws.addEventListener("close", () => {
        setOnlineIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }
    return () => {};
  }, [devices]);

  async function startPair() {
    setPairErr(null);
    setPairBusy(true);
    const res = await fetch("/api/devices/pair", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setPairBusy(false);
    if (!res.ok) return setPairErr("Could not create pairing code.");
    setPairing(await res.json());
    refresh();
  }

  async function unpair(id: string) {
    if (!confirm("Remove this Mac?")) return;
    const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
    if (res.ok) refresh();
  }

  const hasDevices = devices.length > 0;

  return (
    <section className="space-y-4">
      {hasDevices && (
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
            Your Macs
          </h2>
          <button
            onClick={startPair}
            disabled={pairBusy}
            className="inline-flex items-center gap-1.5 rounded-full bg-white text-black text-xs font-semibold py-1.5 pl-2.5 pr-3 disabled:opacity-50 active:scale-95 transition"
          >
            {pairBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" strokeWidth={2.5} />}
            Pair
          </button>
        </div>
      )}

      {!hasDevices && !pairing && (
        <EmptyHero onPair={startPair} busy={pairBusy} />
      )}

      {hasDevices && (
        <ul className="space-y-2.5">
          {devices.map((d) => (
            <DeviceRow
              key={d.id}
              device={d}
              online={onlineIds.has(d.id)}
              onUnpair={() => unpair(d.id)}
            />
          ))}
        </ul>
      )}

      {pairing && (
        <PairModal
          code={pairing.code}
          expiresAt={pairing.expiresAt}
          onClose={() => { setPairing(null); refresh(); }}
        />
      )}
      {pairErr && (
        <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-300">
          {pairErr}
        </p>
      )}
    </section>
  );
}

function EmptyHero({ onPair, busy }: { onPair: () => void; busy: boolean }) {
  return (
    <div className="mt-6 rounded-3xl border border-neutral-800/80 bg-neutral-900/40 p-8 text-center overflow-hidden relative">
      <div className="absolute inset-0 bg-brand-wash pointer-events-none" aria-hidden />
      <div className="relative">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950 shadow-[0_0_0_4px_rgb(255_255_255/0.02)]">
          <Monitor className="size-6 text-sky-400" strokeWidth={1.75} />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">No Macs paired yet</h3>
        <p className="mt-1.5 text-sm text-neutral-500 leading-relaxed">
          Pair your Mac to watch Claude, cmux terminals,<br />
          and Chrome tabs from your phone.
        </p>
        <button
          onClick={onPair}
          disabled={busy}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white text-black text-sm font-semibold py-3 px-5 disabled:opacity-50 active:scale-[0.98] transition"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={2.5} />}
          Pair a Mac
        </button>
      </div>
    </div>
  );
}

function DeviceRow({
  device: d,
  online,
  onUnpair,
}: {
  device: Device;
  online: boolean;
  onUnpair: () => void;
}) {
  const relative = useRelative(d.lastSeenAt);
  const status: "online" | "offline" | "waiting" = !d.paired
    ? "waiting"
    : online
    ? "online"
    : "offline";

  return (
    <li className="group relative rounded-2xl bg-neutral-900/60 border border-neutral-800/80 overflow-hidden">
      <Link
        href={`/dashboard/${d.id}`}
        className="block active:bg-neutral-800/40 transition"
      >
        <div className="flex items-center gap-3.5 p-4 pr-3">
          <div className="relative flex-shrink-0">
            <div className="flex size-11 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950">
              <Monitor className="size-5 text-neutral-300" strokeWidth={1.75} />
            </div>
            {status === "online" && (
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-neutral-950 live-dot" />
            )}
            {status === "offline" && (
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-neutral-600 ring-2 ring-neutral-950" />
            )}
            {status === "waiting" && (
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-amber-400 ring-2 ring-neutral-950 animate-pulse" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold tracking-tight truncate">{d.name}</p>
              <StatusPill status={status} />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500 truncate">
              {status === "online"
                ? "Tap to open sessions, terminals, tabs"
                : status === "waiting"
                ? "Waiting to pair"
                : relative
                ? `Last seen ${relative}`
                : d.lastSeenAt
                ? `Last seen ${formatWhen(d.lastSeenAt)}`
                : "Never connected"}
            </p>
          </div>

          <ChevronRight className="size-5 text-neutral-600 flex-shrink-0" />
        </div>
      </Link>

      <button
        onClick={onUnpair}
        aria-label="Remove Mac"
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center justify-center size-8 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-900 transition"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function StatusPill({ status }: { status: "online" | "offline" | "waiting" }) {
  const map = {
    online: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    offline: "bg-neutral-800/60 text-neutral-400 border-neutral-700/60",
    waiting: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  } as const;
  const label = { online: "live", offline: "offline", waiting: "pairing" } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function PairModal({ code, expiresAt, onClose }: { code: string; expiresAt: string; onClose: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const install = `curl -fsSL ${origin}/install.sh | bash -s ${code}`;
  const [copied, setCopied] = useState<"code" | "cmd" | null>(null);

  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const expired = remaining === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center pt-safe pb-safe px-4">
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Pair your Mac</h3>
            <p className="mt-0.5 text-sm text-neutral-500">Run this on your Mac.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center size-9 rounded-full border border-neutral-800 text-neutral-400 hover:text-neutral-100 active:scale-95 transition"
          >
            <X className="size-4" />
          </button>
        </div>

        <button
          onClick={() => { navigator.clipboard.writeText(install); setCopied("cmd"); setTimeout(() => setCopied(null), 1500); }}
          className="mt-4 w-full text-left group rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition"
        >
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
            <Terminal className="size-3.5 text-neutral-500" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-500">install</span>
            <span className="ml-auto text-[10px] font-medium text-neutral-500 group-hover:text-sky-400">
              {copied === "cmd" ? "copied" : "tap to copy"}
            </span>
          </div>
          <pre className="px-3 pb-3 font-mono text-[12px] leading-snug text-neutral-200 overflow-x-auto whitespace-pre">{install}</pre>
        </button>

        <div className="mt-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-500 text-center">or type the code</p>
          <button
            onClick={() => { navigator.clipboard.writeText(code); setCopied("code"); setTimeout(() => setCopied(null), 1500); }}
            className="mt-2 w-full rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 py-5 font-mono text-3xl tracking-[0.35em] font-medium text-center tabular-nums transition"
          >
            {code}
          </button>
          <p className={`mt-2 text-xs text-center flex items-center justify-center gap-1.5 ${expired ? "text-red-400" : "text-neutral-500"}`}>
            {copied === "code" ? (
              <>
                <Copy className="size-3" /> copied to clipboard
              </>
            ) : expired ? (
              "Code expired. Close and generate a new one."
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                expires in <span className="tabular-nums">{mm}:{String(ss).padStart(2, "0")}</span>
              </>
            )}
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-neutral-800 hover:bg-neutral-700 py-3 font-medium active:scale-[0.99] transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
