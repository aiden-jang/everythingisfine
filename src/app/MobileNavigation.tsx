import { useState } from "react";

interface MobileNavigationProps {
  canvasHeight: number;
  onResize: (height: number) => void;
}

export function MobileNavigation({ canvasHeight, onResize }: MobileNavigationProps): JSX.Element {
  const [preset, setPreset] = useState<{ recent: boolean; height: number }>();
  const show = (recent: boolean): void => {
    const height = Math.round(window.innerHeight * (recent ? 0.46 : 0.82));
    setPreset({ recent, height });
    onResize(height);
    if (!recent) return;
    requestAnimationFrame(() => {
      const rail = document.getElementById("chrome-rail");
      const list = rail?.querySelector('[aria-label="Recent earthquakes"]');
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
        View globe
      </button>
      <button
        type="button"
        aria-controls="chrome-rail"
        aria-pressed={preset?.height === canvasHeight && preset.recent}
        onClick={() => show(true)}
      >
        Recent earthquakes
      </button>
    </nav>
  );
}
