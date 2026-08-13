import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { validateAndNormalizeUrl } from "./validation";
import {
  createLink,
  getStats,
  listLinks,
  resolveAndRecordClick,
  AliasTakenError,
  ValidationError,
} from "./store";
import { isReserved } from "./codec";

/**
 * Build the Express app that backs the single `app` Cloud Function.
 *
 * One function serves both jobs behind the Hosting rewrite (see firebase.json):
 *   - the JSON API under `/api/*`
 *   - short-link redirects at `/:code`
 *
 * `db` is injectable so integration tests can pass an emulator-connected
 * Firestore; in production we lazily resolve the default instance.
 */
export function createApp(db?: Firestore): Express {
  const app = express();
  const database = () => db ?? getFirestore();

  app.use(express.json({ limit: "16kb" }));
  app.use(cors({ origin: true }));
  // Hosting terminates TLS and proxies to the function, so trust the proxy for
  // correct req.protocol / req.ip.
  app.set("trust proxy", true);

  // ---- API ---------------------------------------------------------------

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "url-shortener", time: new Date().toISOString() });
  });

  app.post(
    "/api/shorten",
    asyncHandler(async (req: Request, res: Response) => {
      const { url, alias } = req.body ?? {};

      const check = validateAndNormalizeUrl(url);
      if (!check.ok) {
        return res.status(400).json({ error: check.reason });
      }
      if (alias !== undefined && typeof alias !== "string") {
        return res.status(400).json({ error: "'alias' must be a string." });
      }

      try {
        const link = await createLink(database(), {
          url: check.url!,
          alias: alias && alias.trim() ? alias.trim() : undefined,
        });
        return res.status(201).json({
          code: link.code,
          shortUrl: buildShortUrl(req, link.code),
          url: link.url,
        });
      } catch (err) {
        if (err instanceof AliasTakenError) {
          return res.status(409).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
    }),
  );

  app.get(
    "/api/links",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number.parseInt(String(req.query.limit ?? "20"), 10);
      const links = await listLinks(
        database(),
        Number.isFinite(limit) ? limit : 20,
      );
      return res.json({ links });
    }),
  );

  app.get(
    "/api/stats/:code",
    asyncHandler(async (req: Request, res: Response) => {
      const stats = await getStats(database(), req.params.code);
      if (!stats) {
        return res.status(404).json({ error: "Short code not found." });
      }
      return res.json(stats);
    }),
  );

  // ---- Redirect ----------------------------------------------------------

  app.get(
    "/:code",
    asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      const { code } = req.params;
      if (isReserved(code)) return next();

      const url = await resolveAndRecordClick(database(), code, {
        referer: req.get("referer") || req.get("referrer") || "",
        userAgent: req.get("user-agent") || "",
      });
      if (!url) {
        return res
          .status(404)
          .type("html")
          .send(notFoundPage(code));
      }
      // 302 (not 301): a temporary redirect isn't cached by the browser, so
      // every visit reaches us and is counted. A 301 would undercount clicks.
      return res.redirect(302, url);
    }),
  );

  app.get("/", (_req: Request, res: Response) => {
    res.json({ service: "url-shortener", ok: true });
  });

  // ---- Fallthroughs ------------------------------------------------------

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found." });
  });

  // Centralized error handler — nothing leaks a stack trace to the client.
  app.use(
    (err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error("Unhandled error:", err);
      res.status(500).json({ error: "Internal server error." });
    },
  );

  return app;
}

/** Wrap an async route so rejected promises reach the error handler. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function buildShortUrl(req: Request, code: string): string {
  const host = req.get("host");
  return host ? `${req.protocol}://${host}/${code}` : `/${code}`;
}

function notFoundPage(code: string): string {
  const safe = String(code).replace(/[<>&"]/g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Link not found</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;
display:grid;place-items:center;height:100vh;margin:0}main{text-align:center}
code{background:#1e293b;padding:2px 6px;border-radius:4px}a{color:#38bdf8}</style>
</head><body><main><h1>404 — link not found</h1>
<p>No short link matches <code>/${safe}</code>.</p>
<p><a href="/">Create a short link →</a></p></main></body></html>`;
}
