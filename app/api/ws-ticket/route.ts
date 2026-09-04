import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { signTicket } from "@/lib/ws-ticket";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const deviceId: string = typeof body.deviceId === "string" ? body.deviceId : "";
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const owned = await db
    .select({ id: schema.device.id })
    .from(schema.device)
    .where(and(eq(schema.device.id, deviceId), eq(schema.device.userId, session.user.id)))
    .limit(1);
  if (owned.length === 0) return NextResponse.json({ error: "device not found" }, { status: 404 });

  const ticket = await signTicket({ userId: session.user.id, deviceId });
  const relayUrl = process.env.NEXT_PUBLIC_RELAY_URL ?? "";
  return NextResponse.json({ ticket, relayUrl });
}
