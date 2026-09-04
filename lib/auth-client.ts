import { createAuthClient } from "better-auth/react";

// No baseURL: better-auth uses same-origin relative URLs, so this works
// whether the page is loaded at localhost:3000 or over LAN (e.g. from a phone).
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
