/**
 * Minimal dependency-free SVG bar chart for the clicks timeline. Kept in-repo
 * (rather than pulling a charting library) to keep the bundle small and the
 * build self-contained — a deliberate trade-off for a demo dashboard.
 */
export function BarChart({
  data,
  height = 120,
}: {
  data: { date: string; count: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = 100 / data.length;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Clicks per day"
        className="chart-svg"
      >
        {data.map((d, i) => {
          const h = (d.count / max) * (height - 8);
          return (
            <rect
              key={d.date}
              x={i * barW + barW * 0.15}
              y={height - h}
              width={barW * 0.7}
              height={h}
              rx={0.6}
              className="bar"
            >
              <title>{`${d.date}: ${d.count} click${d.count === 1 ? "" : "s"}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="chart-axis">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}
