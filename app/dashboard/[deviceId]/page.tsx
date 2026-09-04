import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { DeviceView } from "./device-view";

type PageProps = { params: Promise<{ deviceId: string }> };

export default async function DevicePage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { deviceId } = await params;

  const rows = await db
    .select({ id: schema.device.id, name: schema.device.name, paired: schema.device.tokenHash })
    .from(schema.device)
    .where(and(eq(schema.device.id, deviceId), eq(schema.device.userId, session.user.id)))
    .limit(1);

  const dev = rows[0];
  if (!dev) notFound();

  return <DeviceView deviceId={dev.id} deviceName={dev.name} paired={!!dev.paired} />;
}
