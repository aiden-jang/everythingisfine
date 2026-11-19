import type { VisitEvidence } from "./visitEvidence";

export function evidenceTrace(trace: NonNullable<VisitEvidence["trace"]>, width: number, height: number) {
  const low = Math.min(...trace.values);
  const high = Math.max(...trace.values);
  const points = trace.values.map(
    (value, index) =>
      [
        5 + (index / Math.max(1, trace.values.length - 1)) * (width - 10),
        height - 5 - ((value - low) / (high - low || 1)) * (height - 10),
      ] as const,
  );
  return { points, selected: points[trace.selected], low, high };
}

export function EvidenceCard({ evidence }: { evidence: VisitEvidence }) {
  const chart = evidence.trace ? evidenceTrace(evidence.trace, 320, 100) : null;
  return (
    <article className="kept-evidence" aria-label={`${evidence.title} saved evidence`}>
      <div className="kept-evidence-heading">
        <strong>meanwhile.</strong>
        <span>{evidence.kind}</span>
      </div>
      <h3>{evidence.title}</h3>
      <p>{evidence.place}</p>
      {chart && evidence.trace && (
        <figure>
          <svg
            viewBox="0 0 320 100"
            role="img"
            aria-label={`${evidence.place}: measured pressure trace. Marked sample ${evidence.reading} at ${evidence.time}. Range ${chart.low.toFixed(2)} to ${chart.high.toFixed(2)} ${evidence.trace.unit}.`}
          >
            <polyline points={chart.points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" />
            {chart.selected && <circle cx={chart.selected[0]} cy={chart.selected[1]} r="4" />}
          </svg>
          <figcaption>
            {chart.low.toFixed(2)}–{chart.high.toFixed(2)} {evidence.trace.unit}
            <br />
            {evidence.trace.start} — {evidence.trace.end}
          </figcaption>
        </figure>
      )}
      <strong className="kept-reading">{evidence.reading}</strong>
      <p>{evidence.time}</p>
      <p>{evidence.detail}</p>
      <a href={evidence.url} target="_blank" rel="noreferrer">
        {evidence.source}
      </a>
    </article>
  );
}
