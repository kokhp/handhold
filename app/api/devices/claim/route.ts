import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hashToken, newDeviceToken } from "@/lib/ids";

// PUBLIC endpoint (no session). Bridge daemon exchanges a fresh pairing code
// for a long-lived device token. Single-use: code and token slots are checked
// atomically, then code is nulled and token hash is stored.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code: string = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const hostname: string = typeof body.hostname === "string" ? body.hostname.trim() : "";
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  const now = new Date();
  const matches = await db
    .select()
    .from(schema.device)
    .where(
      and(
        eq(schema.device.pairingCode, code),
        gt(schema.device.pairingCodeExpiresAt, now),
        isNull(schema.device.tokenHash),
      ),
    )
    .limit(1);

  const dev = matches[0];
  if (!dev) return NextResponse.json({ error: "invalid or expired code" }, { status: 404 });

  const token = newDeviceToken();
  const nameFromHostname = hostname ? hostname : dev.name;

  await db
    .update(schema.device)
    .set({
      tokenHash: hashToken(token),
      pairingCode: null,
      pairingCodeExpiresAt: null,
      pairedAt: now,
      name: nameFromHostname,
      updatedAt: now,
    })
    .where(eq(schema.device.id, dev.id));

  return NextResponse.json({
    deviceId: dev.id,
    deviceToken: token,
    name: nameFromHostname,
  });
}
