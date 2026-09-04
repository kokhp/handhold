export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-6 pt-safe pb-safe">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">handhold</h1>
          <p className="mt-1 text-sm text-neutral-500">Your Mac in your pocket.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
