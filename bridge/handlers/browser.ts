import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CDP_URL = "http://localhost:9222";

export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  type: string;
  faviconUrl?: string;
};

export async function status(): Promise<{ ok: boolean; hint?: string }> {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { ok: false, hint: `Chrome debug endpoint returned ${res.status}` };
    return { ok: true };
  } catch {
    return {
      ok: false,
      hint: "Chrome is not running with the debug port. Tap 'Launch Chrome with debug port' to do it automatically, or run: open -na 'Google Chrome' --args --remote-debugging-port=9222",
    };
  }
}

export async function listTabs(): Promise<{ ok: boolean; tabs?: BrowserTab[]; error?: string }> {
  try {
    const res = await fetch(`${CDP_URL}/json`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const raw = (await res.json()) as Array<any>;
    const tabs: BrowserTab[] = raw
      .filter((t) => t.type === "page")
      .map((t) => ({ id: t.id, title: t.title ?? "", url: t.url ?? "", type: t.type, faviconUrl: t.faviconUrl }));
    return { ok: true, tabs };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function activateTab(tabId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${CDP_URL}/json/activate/${tabId}`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function closeTab(tabId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${CDP_URL}/json/close/${tabId}`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// One-click: quit Chrome cleanly, then relaunch it with the debug port on.
export async function launchDebug(): Promise<{ ok: boolean; error?: string }> {
  try {
    // Quit Chrome via AppleScript (respects sessions/tabs); ignore if not running.
    try {
      await execFileAsync("/usr/bin/osascript", ["-e", 'tell application "Google Chrome" to quit'], { timeout: 5000 });
    } catch {}
    // Give it a beat to actually exit.
    await new Promise((r) => setTimeout(r, 1500));
    await execFileAsync("/usr/bin/open", ["-na", "Google Chrome", "--args", "--remote-debugging-port=9222"], { timeout: 5000 });
    // Wait for debug endpoint to come up.
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const s = await status();
      if (s.ok) return { ok: true };
      await new Promise((r) => setTimeout(r, 400));
    }
    return { ok: false, error: "Chrome relaunched but debug port didn't come up within 8s" };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
