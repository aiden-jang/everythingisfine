import type { SkyCity, SkyLook, TonightView } from "../../geo/tonight";
import type { CameraState } from "../../globe/controls";

export class ObservationDataError extends Error {}

export interface GeoPoint {
  lon: number;
  lat: number;
  lift?: number;
}

export interface ObservationMark extends GeoPoint {
  size?: number;
  color?: number;
}

export interface ObservationPath {
  points: readonly GeoPoint[];
  color?: number;
}

export interface ObservationRaster {
  url: string;
  bounds?: readonly [west: number, south: number, east: number, north: number];
  opacity?: number;
  corners?: readonly [GeoPoint, GeoPoint, GeoPoint, GeoPoint];
}

export interface Measurement {
  label: string;
  value: string;
}

export interface ObservationFrame {
  at: number;
  timeLabel?: string;
  reconstruction?: boolean;
  photograph?: { url: string; alt: string };
  marks?: readonly ObservationMark[];
  paths?: readonly ObservationPath[];
  raster?: ObservationRaster;
  measurements?: readonly Measurement[];
  flow?: boolean;
  tide?: { observed: number; predicted?: number | undefined; min: number; max: number };
  camera?: CameraState;
  details?: { title: string; rows: readonly Measurement[] };
  localSky?: { city: SkyCity; look: SkyLook };
}

export interface ObservationSeries {
  label: string;
  samples: readonly (readonly [at: number, value: number])[];
}

export interface ObservationData {
  frames: readonly ObservationFrame[];
  target: CameraState;
  mapTarget?: CameraState;
  lens?: ObservationView["lens"];
  note: string;
  series?: readonly ObservationSeries[];
  units?: string;
  initial?: number;
  chapters?: readonly { index: number; label: string }[];
}

export interface ObservationView {
  kind: "observation";
  frame: ObservationFrame;
  target: CameraState;
  image: HTMLImageElement | null;
  surface?: HTMLCanvasElement;
  lens?: { globe: number; map: number };
  sky?: TonightView | undefined;
  shadow?: { point: GeoPoint; pose: CameraState } | undefined;
  arrive?: (scale: number, reduced: boolean) => void;
}

export interface ObservationOption {
  id: string;
  label: string;
}

export interface ObservationSource {
  options?: readonly ObservationOption[];
  refreshMs?: number;
  load: (option: string, signal: AbortSignal) => Promise<ObservationData>;
}
