import { DEG } from "../../geo/sphere";

export function StoryCompass({ value, label }: { value: number; label: string }): JSX.Element {
  const degrees = Math.abs(value).toFixed(2);
  const direction = Number(degrees) === 0 ? "" : value < 0 ? "west" : "east";
  const endX = 60 + 26 * Math.sin(value * DEG);
  const endY = 54 - 26 * Math.cos(value * DEG);
  const arc = value ? `M60 28A26 26 0 0 ${value < 0 ? 0 : 1} ${endX} ${endY}` : "";
  return (
    <figure className="story-compass">
      <svg viewBox="0 0 120 100" aria-hidden="true">
        <circle cx="60" cy="54" r="35" />
        <path d="M60 87V19M55 26L60 19L65 26" />
        <path className="story-compass-arc" d={arc} />
        <g className="story-compass-needle" transform={`rotate(${value} 60 54)`}>
          <path d="M60 82V23L56 32M60 23L64 32" />
        </g>
        <text x="60" y="12" textAnchor="middle">
          True N
        </text>
      </svg>
      <figcaption>
        <span>{label}</span>
        <strong>
          {degrees}°{direction && ` ${direction}`}
        </strong>
        <span>From true north to modelled magnetic north</span>
      </figcaption>
    </figure>
  );
}
