import type { MapLayer } from "./layerVisibility";

const paths: Record<MapLayer, string> = {
  radar: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11v2m-1-1h2m-1 0 7-8",
  wind: "M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3",
  lightning: "m13 2-9 12h7l-1 8 10-13h-7z",
  aurora: "M3 11v7m4-10v10m5-14v14m5-10v10m4-7v7",
  earthquakes: "M2 12h4l3-9 4 18 3-12 2 3h4",
  cyclones:
    "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4M12 3a9 9 0 0 1 7 15M12 21A9 9 0 0 1 5 6M6 3a7 7 0 0 0 0 14M18 21a7 7 0 0 0 0-14",
  fires: "M12 2c1 6-5 6-3 11 2-1 3-3 3-5 5 3 7 6 6 9a7 7 0 0 1-13-1c-1-4 3-6 3-10 1 2 1 3 2 4",
  floods: "M2 7q3-3 5 0t5 0 5 0 5 0M2 12q3-3 5 0t5 0 5 0 5 0M2 17q3-3 5 0t5 0 5 0 5 0",
  volcanoes: "m3 21 6-13h6l6 13zM9 8l3 3 3-3M10 4l-1-2m5 2 1-2",
};

export function LayerIcon({ layer }: { layer: MapLayer }) {
  return (
    <svg className="layer-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={paths[layer]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
