import { sheetStops } from "./sheetLayout";

interface MobileNavigationProps {
  canvasHeight: number;
  viewportHeight: number;
  flat: boolean;
  onResize: (height: number) => void;
  panel: string;
}

export function MobileNavigation({
  canvasHeight,
  viewportHeight,
  flat,
  onResize,
  panel,
}: MobileNavigationProps): JSX.Element {
  const [expanded, half, collapsed] = sheetStops(viewportHeight);
  const current = canvasHeight || half;
  const show = () => {
    onResize(current <= half && current > expanded ? expanded : half);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('.explorer-tabs [aria-selected="true"]')
        ?.focus({ preventScroll: true });
    });
  };
  return (
    <nav aria-label="Explore" className="mobile-navigation md:hidden">
      <button
        type="button"
        aria-controls="chrome-rail"
        aria-label={flat ? "Expand map" : "Expand globe"}
        title={flat ? "Expand map" : "Expand globe"}
        aria-pressed={current === collapsed}
        onClick={() => onResize(collapsed)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        type="button"
        aria-controls="chrome-rail"
        aria-label={panel}
        title={current <= half && current > expanded ? "Expand panel" : "Half-height panel"}
        aria-description="Show the panel at half height. Activate again to expand it."
        aria-pressed={current <= half}
        onClick={show}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </nav>
  );
}
