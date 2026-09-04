import { createHash, randomBytes } from "node:crypto";
import { customAlphabet } from "nanoid";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generatePairing = customAlphabet(PAIRING_ALPHABET, 8);

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function newPairingCode(): string {
  return generatePairing();
}

export function newDeviceToken(): string {
  return `dvt_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
