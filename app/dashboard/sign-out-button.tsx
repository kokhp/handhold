"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
      className="text-sm text-neutral-400 hover:text-neutral-100 disabled:opacity-50"
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
