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

  return (
    <main className="min-h-svh px-6 pt-safe pb-safe">
      <div className="mx-auto max-w-md">
        <header className="flex items-center justify-between py-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">handhold</p>
            <h1 className="text-xl font-semibold">Hi, {session.user.name.split(" ")[0]}</h1>
          </div>
          <SignOutButton />
        </header>

        <DevicesPanel initialDevices={initialDevices} />

        <div className="mt-8 text-xs text-neutral-600 text-center">
          Signed in as {session.user.email} · session expires {new Date(session.session.expiresAt).toISOString().slice(0, 10)}
        </div>
      </div>
    </main>
  );
}
