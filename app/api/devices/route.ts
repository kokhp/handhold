import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: schema.device.id,
      name: schema.device.name,
      pairedAt: schema.device.pairedAt,
      lastSeenAt: schema.device.lastSeenAt,
      isPaired: schema.device.tokenHash,
    })
    .from(schema.device)
    .where(eq(schema.device.userId, session.user.id));

  return NextResponse.json({
    devices: rows.map((r) => ({
      id: r.id,
      name: r.name,
      pairedAt: r.pairedAt,
      lastSeenAt: r.lastSeenAt,
      paired: !!r.isPaired,
    })),
  });
}
