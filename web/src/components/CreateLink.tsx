import { FormEvent, useState } from "react";
import { shorten, ShortenResponse } from "../api";

export function CreateLink({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [result, setResult] = useState<ShortenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await shorten(url.trim(), alias.trim() || undefined);
      setResult(res);
      setUrl("");
      setAlias("");
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card">
      <h2>Shorten a URL</h2>
      <form onSubmit={onSubmit} className="form">
        <label>
          Destination URL
          <input
            type="url"
            required
            placeholder="https://example.com/a/very/long/link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          Custom alias <span className="muted">(optional)</span>
          <input
            type="text"
            placeholder="my-link"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Shortening…" : "Shorten"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <span className="result-label">Short link</span>
          <div className="result-row">
            <a href={result.shortUrl} target="_blank" rel="noreferrer">
              {result.shortUrl}
            </a>
            <button className="ghost" onClick={copy}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <span className="muted small">→ {result.url}</span>
        </div>
      )}
    </div>
  );
}
