import { useState } from "react";

interface MobileNavigationProps {
  canvasHeight: number;
  flat: boolean;
  onResize: (height: number) => void;
  earthquakes: boolean;
  onActivity: () => void;
}

export function MobileNavigation({
  canvasHeight,
  flat,
  onResize,
  earthquakes,
  onActivity,
}: MobileNavigationProps): JSX.Element {
  const [preset, setPreset] = useState<{ recent: boolean; height: number }>();
  const show = (recent: boolean): void => {
    const height = Math.round(window.innerHeight * (recent ? 0.46 : 0.82));
    setPreset({ recent, height });
    onResize(height);
    if (!recent) return;
    if (earthquakes) onActivity();
    requestAnimationFrame(() => {
      const rail = document.getElementById("chrome-rail");
      const list = rail?.querySelector(earthquakes ? '[aria-label="Recent earthquakes"]' : ".map-layers");
      if (rail && list) {
        rail.scrollTo({
          top: rail.scrollTop + list.getBoundingClientRect().top - rail.getBoundingClientRect().top - 64,
        });
      }
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
        {earthquakes ? "Recent earthquakes" : "Layers & activity"}
      </button>
    </nav>
  );
}
