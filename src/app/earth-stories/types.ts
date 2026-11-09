import type { CameraState } from "../../globe/controls";
import type {
  ObservationFrame,
  ObservationSeries,
  ObservationTerrain,
  ObservationView,
} from "../observations/types";

export interface StoryFrame extends ObservationFrame {
  caption: string;
}
export interface StorySite {
  id: string;
  label: string;
  lon: number;
  lat: number;
  at: number;
  value: string;
}
export interface EarthStoryData {
  frames: readonly StoryFrame[];
  sky?: (at: number) => NonNullable<ObservationView["sky"]>;
  geometry?: (frame: StoryFrame) => ObservationFrame;
  target: CameraState;
  mapTarget?: CameraState;
  lens?: { globe: number; map: number };
  chapters: readonly { at: number; label: string }[];
  series?: readonly ObservationSeries[];
  units?: string;
  sites?: readonly StorySite[];
  legend?: readonly { color: string; label: string }[];
  terrain?: ObservationTerrain;
  timelineLabel?: string;
  lunarImage?: string;
}
const files = import.meta.glob<string>("../../sources/earth-stories/assets/*.webp", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
export function asset(name: string): string {
  const url = files[`../../sources/earth-stories/assets/${name}`];
  if (!url) throw new Error(`Missing story image: ${name}`);
  return url;
}
export const date = (day: string) => Date.parse(`${day}T12:00:00Z`);
export const point = ([lon, lat]: readonly number[]) => ({ lon: lon!, lat: lat! });
