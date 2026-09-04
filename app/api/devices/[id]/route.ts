import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const deleted = await db
    .delete(schema.device)
    .where(and(eq(schema.device.id, id), eq(schema.device.userId, session.user.id)))
    .returning({ id: schema.device.id });

  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
