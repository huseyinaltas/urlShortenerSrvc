#!/usr/bin/env node
/**
 * Seed the running emulator with a few demo links and simulated clicks so the
 * dashboard has something to show on first run.
 *
 * Usage:  npm run seed        (with the emulators already running)
 *
 * It talks to the API through the Hosting emulator (default :5050), exactly like
 * the web app does — no Admin SDK, no credentials.
 */

const BASE = process.env.SEED_BASE_URL || "http://localhost:5050";

const LINKS = [
  { url: "https://firebase.google.com/docs/functions", alias: "fns" },
  { url: "https://react.dev/learn", alias: "react" },
  { url: "https://www.typescriptlang.org/docs/", alias: "ts-docs" },
  { url: "https://example.com/a/very/long/marketing/campaign/link?utm=demo" },
];

const REFERERS = [
  "https://twitter.com/",
  "https://news.ycombinator.com/",
  "https://www.google.com/",
  "", // direct
];

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function hit(code, referer) {
  await fetch(`${BASE}/${code}`, {
    redirect: "manual",
    headers: referer ? { referer } : {},
  });
}

async function main() {
  // Fail fast with a clear message if the emulator isn't up.
  try {
    const health = await fetch(`${BASE}/api/health`);
    if (!health.ok) throw new Error(`health ${health.status}`);
  } catch (e) {
    console.error(
      `Cannot reach the API at ${BASE}. Start the emulators first ` +
        `(npm run dev, or firebase emulators:start).\n${e.message}`,
    );
    process.exit(1);
  }

  for (const link of LINKS) {
    const { status, body } = await post("/api/shorten", link);
    if (status !== 201) {
      console.log(`• skip ${link.alias || link.url} — ${body.error || status}`);
      continue;
    }
    const code = body.code;
    // Random number of clicks from random referers.
    const clicks = 3 + Math.floor(Math.random() * 20);
    for (let i = 0; i < clicks; i++) {
      await hit(code, REFERERS[Math.floor(Math.random() * REFERERS.length)]);
    }
    console.log(`✓ ${code} → ${body.url}  (${clicks} clicks)`);
  }

  console.log("\nDone. Open the dashboard and select a link to see analytics.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
