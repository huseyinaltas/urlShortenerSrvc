import type { FullConfig } from "@playwright/test";

/**
 * Global setup: wait for the app to be reachable, then best-effort clear the
 * Firestore emulator so the run starts from a clean slate.
 *
 * The clear is best-effort (it warns rather than throws) because it depends on
 * the Firestore emulator being reachable; every test also uses unique codes, so
 * the suite is correct whether or not the clear succeeds.
 *
 * ⚠️ Running E2E wipes the Firestore emulator's data.
 */
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const PROJECT = process.env.GCLOUD_PROJECT || "demo-url-shortener";

async function waitForApp(baseUrl: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `App not reachable at ${baseUrl}/api/health within ${timeoutMs}ms: ${lastErr}`,
  );
}

async function clearFirestore(): Promise<void> {
  const url = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`clear returned ${res.status}`);
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseUrl =
    (config.projects[0]?.use?.baseURL as string) ||
    process.env.E2E_BASE_URL ||
    "http://localhost:5050";

  await waitForApp(baseUrl);

  try {
    await clearFirestore();
    console.log("[global-setup] Firestore emulator cleared.");
  } catch (e) {
    console.warn(
      `[global-setup] Could not clear Firestore emulator (${(e as Error).message}). ` +
        `Continuing — tests use unique codes.`,
    );
  }
}
