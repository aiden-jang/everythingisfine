import type { SkyCity, SkyLook, TonightView } from "../../geo/tonight";
import type { CameraState } from "../../globe/controls";

export class ObservationDataError extends Error {}

export interface GeoPoint {
  lon: number;
  lat: number;
  lift?: number;
}

export interface ObservationMark extends GeoPoint {
  reading?: Measurement;
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
  sweep?: boolean;
  corners?: readonly [GeoPoint, GeoPoint, GeoPoint, GeoPoint];
}

export interface Measurement {
  label: string;
  value: string;
}

export interface ObservationFrame {
  at: number;
  timeLabel?: string;
  sequence?: boolean;
  reconstruction?: boolean;
  photograph?: { url: string; alt: string };
  marks?: readonly ObservationMark[];
  paths?: readonly ObservationPath[];
  raster?: ObservationRaster;
  measurements?: readonly Measurement[];
  flow?: boolean;
  pathOpacity?: number;
  tide?: { observed: number; predicted?: number | undefined; min: number; max: number };
  camera?: CameraState;
  details?: { title: string; rows: readonly Measurement[] };
  localSky?: { city: SkyCity; look: SkyLook };
  section?: {
    image: string;
    points: readonly GeoPoint[];
    heightKm: number;
    exaggeration: number;
    label: string;
  };
  orbit?: {
    focus: readonly [number, number, number];
    distance: number;
    eclipse?: { moon: GeoPoint; radius: number; sun: GeoPoint; sunDistance: number };
  };
}

export interface ObservationTerrain {
  bounds: readonly [number, number, number, number];
  columns: number;
  rows: number;
  elevation: readonly number[];
  tid: readonly number[];
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

export interface ReplayCamera extends CameraState {
  bank?: number;
  pitch?: number;
}

export interface ObservationView {
  /** False while a DOM photo or video covers the shared canvas. */
  capture?: boolean;
  kind: "observation";
  cameraKey?: string;
  frame: ObservationFrame;
  target: CameraState;
  image: HTMLImageElement | null;
  surface?: HTMLCanvasElement;
  curtain?: {
    points: readonly GeoPoint[];
    heightKm: number;
    exaggeration: number;
    image: HTMLImageElement;
    down?: boolean;
  };
  terrain?: { grid: ObservationTerrain; progress: number };
  moonImage?: HTMLImageElement | null;
  onPick?: ((point: GeoPoint) => void) | undefined;
  pickOnGlobe?: boolean;
  lens?: { globe: number; map: number };
  sky?: TonightView | undefined;
  follow?: ReplayCamera | undefined;
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
