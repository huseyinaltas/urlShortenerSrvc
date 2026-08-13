import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";
import { createApp } from "./app";

// Initialize the Admin SDK exactly once (the module can be re-imported by the
// functions runtime / tests). No credentials are needed on the emulator, and in
// production the runtime provides them via ADC.
if (getApps().length === 0) {
  initializeApp();
}

// Keep a lid on cost/concurrency for a demo service; region matches the
// existing shockServices deployment convention.
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

/**
 * Single HTTP entry point. Hosting rewrites every non-static request to this
 * function (see firebase.json): `/api/*` for the JSON API and `/:code` for
 * short-link redirects.
 */
export const app = onRequest(createApp());
