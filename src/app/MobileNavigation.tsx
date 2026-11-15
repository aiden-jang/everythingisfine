interface MobileNavigationProps {
  canvasHeight: number;
  stops: readonly [number, number, number];
  onResize: (height: number) => void;
  panel: string;
}

export function MobileNavigation({ canvasHeight, stops, onResize, panel }: MobileNavigationProps) {
  const [, half, collapsed] = stops;
  const open = (canvasHeight || half) < collapsed;
  const label = open ? "More globe" : "More controls";
  return (
    <nav aria-label="Explore" className="mobile-navigation md:hidden">
      <button
        type="button"
        aria-controls="chrome-rail"
        aria-label={label}
        aria-expanded={open}
        title={`${label} · ${panel}`}
        onClick={() => onResize(open ? collapsed : half)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d={open ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <span>{label}</span>
      </button>
    </nav>
  );
}
