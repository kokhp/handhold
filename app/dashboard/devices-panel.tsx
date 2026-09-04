"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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

  return (
    <section className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-neutral-500">Your Macs</h2>
        <button
          onClick={startPair}
          disabled={pairBusy}
          className="rounded-lg bg-white text-black text-sm font-medium py-2 px-3 disabled:opacity-50"
        >
          {pairBusy ? "…" : "Pair a Mac"}
        </button>
      </div>

      {devices.length === 0 && !pairing && (
        <div className="rounded-2xl border border-dashed border-neutral-800 p-6 text-center">
          <div className="text-4xl mb-3">🖥️</div>
          <p className="text-sm text-neutral-500">No Macs paired yet. Tap "Pair a Mac" above.</p>
        </div>
      )}

      <ul className="space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center">
            <Link href={`/dashboard/${d.id}`} className="flex-1 min-w-0 p-4 active:bg-neutral-800/50 rounded-l-2xl">
              <div className="flex items-center gap-2">
                <span className={`inline-block size-2 rounded-full ${onlineIds.has(d.id) ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/50" : "bg-neutral-600"}`} />
                <p className="font-medium truncate">{d.name}</p>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 truncate">
                {d.paired ? (onlineIds.has(d.id) ? "online" : d.lastSeenAt ? `last seen ${formatWhen(d.lastSeenAt)}` : "offline") : "waiting for pair"}
              </p>
            </Link>
            <button onClick={() => unpair(d.id)} className="text-xs text-neutral-500 hover:text-red-400 px-4 py-4">
              ×
            </button>
          </li>
        ))}
      </ul>

      {pairing && (
        <PairModal
          code={pairing.code}
          expiresAt={pairing.expiresAt}
          onClose={() => { setPairing(null); refresh(); }}
        />
      )}
      {pairErr && <p className="text-sm text-red-400">{pairErr}</p>}
    </section>
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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center pt-safe pb-safe px-4">
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
        <h3 className="text-lg font-medium">Pair your Mac</h3>
        <p className="mt-1 text-sm text-neutral-500">On your Mac, run:</p>
        <button
          onClick={() => { navigator.clipboard.writeText(install); setCopied("cmd"); setTimeout(() => setCopied(null), 1500); }}
          className="mt-3 w-full text-left rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 font-mono text-[13px] overflow-x-auto"
        >
          {install}
        </button>
        <p className="mt-4 text-xs uppercase tracking-widest text-neutral-500">or type the code manually</p>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied("code"); setTimeout(() => setCopied(null), 1500); }}
          className="mt-2 w-full rounded-xl bg-neutral-950 border border-neutral-800 py-4 font-mono text-2xl tracking-[0.3em] text-center"
        >
          {code}
        </button>
        <p className="mt-2 text-xs text-neutral-500 text-center">
          {copied ? "copied ✓" : remaining === 0 ? "expired" : `expires in ${mm}:${String(ss).padStart(2, "0")}`}
        </p>
        <button onClick={onClose} className="mt-6 w-full rounded-xl bg-neutral-800 py-3 font-medium">
          Done
        </button>
      </div>
    </div>
  );
}
