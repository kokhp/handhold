"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function handle() {
    setBusy(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={handle}
      disabled={busy}
      aria-label="Sign out"
      className="inline-flex items-center justify-center size-10 rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-neutral-100 hover:border-neutral-700 disabled:opacity-50 active:scale-95 transition"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
    </button>
  );
}
