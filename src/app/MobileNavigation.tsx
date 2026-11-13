import { useState } from "react";

interface MobileNavigationProps {
  canvasHeight: number;
  flat: boolean;
  onResize: (height: number) => void;
  panel: string;
}

export function MobileNavigation({
  canvasHeight,
  flat,
  onResize,
  panel,
}: MobileNavigationProps): JSX.Element {
  const [preset, setPreset] = useState<{ recent: boolean; height: number }>();
  const show = (recent: boolean): void => {
    const height = Math.round(window.innerHeight * (recent ? 0.46 : 0.82));
    setPreset({ recent, height });
    onResize(height);
    if (!recent) return;
    requestAnimationFrame(() => {
      document.getElementById("chrome-rail")?.scrollTo({ top: 0 });
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
        aria-pressed={preset?.height === canvasHeight && !preset.recent}
        onClick={() => show(false)}
      >
        {flat ? "Expand map" : "Expand globe"}
      </button>
      <button
        type="button"
        aria-controls="chrome-rail"
        aria-pressed={preset?.height === canvasHeight && preset.recent}
        onClick={() => show(true)}
      >
        {panel}
      </button>
    </nav>
  );
}
