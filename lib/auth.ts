import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_DAY = 60 * 60 * 24;

const devLanOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const envOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Also permit any http://<LAN IP>:3000 so phones on the same wifi can auth in dev.
const lanPatterns =
  process.env.NODE_ENV !== "production"
    ? ["http://192.168.*.*:3000", "http://10.*.*.*:3000", "http://172.16.*.*:3000"]
    : [];

export const auth = betterAuth({
  appName: "handhold",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),
  trustedOrigins: [...devLanOrigins, ...envOrigins, ...lanPatterns],

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  session: {
    expiresIn: THIRTY_DAYS,
    updateAge: ONE_DAY,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    cookiePrefix: "handhold",
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
