"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await signUp.email({ name, email, password, callbackURL: "/dashboard" });
    setBusy(false);
    if (res.error) return setErr(res.error.message ?? "Could not create account.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1.5 text-neutral-300">Name</label>
        <input
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3.5 outline-none focus:border-neutral-600 text-base"
        />
      </div>
      <div>
        <label className="block text-sm mb-1.5 text-neutral-300">Email</label>
        <input
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
        <label className="block text-sm mb-1.5 text-neutral-300">Password</label>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3.5 outline-none focus:border-neutral-600 text-base"
        />
        <p className="mt-1.5 text-xs text-neutral-500">At least 8 characters.</p>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-white text-black font-medium py-3.5 disabled:opacity-50 active:scale-[0.99] transition"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-neutral-500 pt-2">
        Already have an account?{" "}
        <Link href="/login" className="text-neutral-200 underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
