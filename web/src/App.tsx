import { useCallback, useEffect, useState } from "react";
import { listLinks, LinkSummary } from "./api";
import { CreateLink } from "./components/CreateLink";
import { LinkList } from "./components/LinkList";
import { StatsPanel } from "./components/StatsPanel";

export function App() {
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLinks(await listLinks(50));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="app">
      <header className="hero">
        <h1>
          <span className="logo">🔗</span> Shortly
        </h1>
        <p className="tagline">
          AI-assisted URL shortener — Firebase Functions · Firestore · React
        </p>
      </header>

      <main className="grid">
        <section className="col">
          <CreateLink
            onCreated={() => {
              refresh();
            }}
          />
          {error && <p className="error banner">{error}</p>}
          <LinkList
            links={links}
            selected={selected}
            onSelect={setSelected}
            onRefresh={refresh}
          />
        </section>

        <section className="col">
          <StatsPanel code={selected} />
        </section>
      </main>

      <footer className="footer">
        <span>Emulator-first demo. No cloud credentials required.</span>
      </footer>
    </div>
  );
}
