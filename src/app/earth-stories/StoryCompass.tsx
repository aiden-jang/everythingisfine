export function StoryCompass({ value }: { value: number }): JSX.Element {
  return (
    <figure className="story-compass">
      <svg
        viewBox="0 0 120 100"
        role="img"
        aria-label={`Magnetic north is ${Math.abs(value).toFixed(2)} degrees ${value < 0 ? "west" : "east"} of true north`}
      >
        <circle cx="60" cy="54" r="35" />
        <path d="M60 87V19M55 26L60 19L65 26" />
        <g style={{ transform: `rotate(${value}deg)`, transformOrigin: "60px 54px" }}>
          <path d="M60 82V23L56 32M60 23L64 32" />
        </g>
        <text x="60" y="12" textAnchor="middle">
          True N
        </text>
      </svg>
      <figcaption>
        Solid needle · true north
        <br />
        Bright needle · modelled magnetic north
      </figcaption>
    </figure>
  );
}
