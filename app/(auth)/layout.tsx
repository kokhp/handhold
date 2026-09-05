export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-svh flex flex-col items-center justify-center px-6 pt-safe pb-safe bg-brand-wash">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center">
          <LogoMark className="size-11" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">handhold</h1>
          <p className="mt-1 text-sm text-neutral-500">Your Mac in your pocket.</p>
        </div>
        <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800/80 backdrop-blur-sm p-5 shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset]">
          {children}
        </div>
        <p className="mt-8 text-center text-[11px] text-neutral-600">
          Session length is 30 days. Bring your own Mac.
        </p>
      </div>
    </main>
  );
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <rect x="1" y="1" width="42" height="42" rx="12" fill="url(#g)" />
      <rect x="1" y="1" width="42" height="42" rx="12" stroke="rgb(56 189 248 / 0.35)" />
      <path
        d="M14 15v14M14 22h8m0-7v14m0-7v0m8-7v14"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="g" x1="0" x2="44" y1="0" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(15 23 42)" />
          <stop offset="1" stopColor="rgb(8 13 24)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
