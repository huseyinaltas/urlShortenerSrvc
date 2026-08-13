import { LinkSummary } from "../api";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function LinkList({
  links,
  selected,
  onSelect,
  onRefresh,
}: {
  links: LinkSummary[];
  selected: string | null;
  onSelect: (code: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Links</h2>
        <button className="ghost" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {links.length === 0 ? (
        <p className="muted">No links yet — shorten one above.</p>
      ) : (
        <table className="links">
          <thead>
            <tr>
              <th>Code</th>
              <th>Destination</th>
              <th className="num">Clicks</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr
                key={l.code}
                data-testid="link-row"
                className={selected === l.code ? "active" : ""}
                onClick={() => onSelect(l.code)}
              >
                <td>
                  <code>{l.code}</code>
                </td>
                <td className="dest" title={l.url}>
                  {l.url}
                </td>
                <td className="num">{l.clickCount}</td>
                <td className="muted small">{timeAgo(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small hint">Select a link to see its analytics →</p>
    </div>
  );
}
