import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { newId, newPairingCode } from "@/lib/ids";

// Session-authed. User clicks "Pair a Mac" on their dashboard.
// Returns { code, expiresAt, deviceId } — code is short-lived (10 min).
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name: string = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New Mac";

  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const deviceId = newId("dev");

  await db.insert(schema.device).values({
    id: deviceId,
    userId: session.user.id,
    name,
    pairingCode: code,
    pairingCodeExpiresAt: expiresAt,
  });

  return NextResponse.json({ code, expiresAt: expiresAt.toISOString(), deviceId });
}
