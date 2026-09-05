"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserPlus, User, Mail, Lock } from "lucide-react";
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
      <Field id="name" label="Name" icon={<User className="size-4" />} type="text" autoComplete="name" value={name} onChange={setName} required />
      <Field id="email" label="Email" icon={<Mail className="size-4" />} type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required />
      <div>
        <Field id="password" label="Password" icon={<Lock className="size-4" />} type="password" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} required />
        <p className="mt-1.5 text-xs text-neutral-500">At least 8 characters.</p>
      </div>

      {err && (
        <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-300">
          {err}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black font-medium py-3.5 disabled:opacity-50 active:scale-[0.98] transition"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        {busy ? "Creating account" : "Create account"}
      </button>

      <p className="text-center text-sm text-neutral-500 pt-1">
        Already have an account?{" "}
        <Link href="/login" className="text-neutral-100 underline underline-offset-4 decoration-neutral-700 hover:decoration-neutral-400">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  icon,
  type,
  value,
  onChange,
  ...rest
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  minLength?: number;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1.5 text-neutral-400 tracking-wide">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
          {icon}
        </span>
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl bg-neutral-950/70 border border-neutral-800 pl-10 pr-4 py-3.5 outline-none text-base transition focus:border-sky-400/60 focus:bg-neutral-950 focus:ring-2 focus:ring-sky-400/10"
          {...rest}
        />
      </div>
    </div>
  );
}
