import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { SignOutButton } from "./sign-out-button";
import { DevicesPanel } from "./devices-panel";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const rows = await db
    .select({
      id: schema.device.id,
      name: schema.device.name,
      pairedAt: schema.device.pairedAt,
      lastSeenAt: schema.device.lastSeenAt,
      tokenHash: schema.device.tokenHash,
    })
    .from(schema.device)
    .where(eq(schema.device.userId, session.user.id));

  const initialDevices = rows.map((r) => ({
    id: r.id,
    name: r.name,
    pairedAt: r.pairedAt?.toISOString() ?? null,
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    paired: !!r.tokenHash,
  }));

  const firstName = session.user.name.split(" ")[0];

  return (
    <main className="relative min-h-svh px-5 pt-safe pb-safe bg-brand-wash">
      <div className="mx-auto max-w-md">
        <header className="flex items-center justify-between pt-3 pb-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-400/80">
              handhold
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight truncate">
              Hi, {firstName}
            </h1>
          </div>
          <SignOutButton />
        </header>

        <DevicesPanel initialDevices={initialDevices} />

        <div className="mt-10 pt-6 border-t border-neutral-900/80 text-[11px] text-neutral-600 text-center leading-relaxed">
          <p className="truncate">{session.user.email}</p>
          <p className="mt-0.5">
            Session expires {new Date(session.session.expiresAt).toISOString().slice(0, 10)}
          </p>
        </div>
      </div>
    </main>
  );
}
