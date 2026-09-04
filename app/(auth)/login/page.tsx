"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const nextParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next") ?? "/dashboard"
        : "/dashboard";
    const res = await signIn.email({ email, password, rememberMe, callbackURL: nextParam });
    setBusy(false);
    if (res.error) return setErr(res.error.message ?? "Sign-in failed.");
    router.push(nextParam);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm mb-1.5 text-neutral-300">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3.5 outline-none focus:border-neutral-600 text-base"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm mb-1.5 text-neutral-300">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3.5 outline-none focus:border-neutral-600 text-base"
        />
      </div>

      <label className="flex items-center gap-2 py-1 text-sm text-neutral-300 select-none">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="size-4 accent-white"
        />
        Keep me signed in for 30 days
      </label>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-white text-black font-medium py-3.5 disabled:opacity-50 active:scale-[0.99] transition"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-neutral-500 pt-2">
        No account?{" "}
        <Link href="/signup" className="text-neutral-200 underline underline-offset-4">
          Create one
        </Link>
      </p>
    </form>
  );
}
