import { SignJWT, jwtVerify } from "jose";

// Short-lived JWT the mobile UI trades a session cookie for, then presents to
// the Fly.io-hosted relay as ?ticket=... on the WebSocket URL. Avoids cross-
// origin cookie hell between vercel.app (pages) and fly.dev (WS).

const ISSUER = "handhold-web";
const AUDIENCE = "handhold-relay";
const TTL_SECONDS = 60;

function secret(): Uint8Array {
  const raw = process.env.WS_TICKET_SECRET;
  if (!raw) throw new Error("WS_TICKET_SECRET not set");
  return new TextEncoder().encode(raw);
}

export type TicketClaims = { userId: string; deviceId: string };

export async function signTicket(claims: TicketClaims): Promise<string> {
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(secret());
}

export async function verifyTicket(token: string): Promise<TicketClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.userId !== "string" || typeof payload.deviceId !== "string") return null;
    return { userId: payload.userId, deviceId: payload.deviceId };
  } catch {
    return null;
  }
}
