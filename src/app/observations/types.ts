import type { SkyCity, SkyLook, TonightView } from "../../geo/tonight";
import type { CameraState } from "../../globe/controls";

export class ObservationDataError extends Error {}

export interface GeoPoint {
  lon: number;
  lat: number;
  lift?: number;
}

export interface ObservationMark extends GeoPoint {
  id?: string;
  reading?: Measurement;
  size?: number;
  color?: number;
  elapsed?: number;
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

export interface MooringSection {
  topDepth: number;
  readings: readonly { lon: number; depth: number; temperature: number; days: number }[];
}

export interface RiverGaugeReading {
  id: string;
  label: string;
  available: boolean;
  value: number | undefined;
}

export interface ObservationFrame {
  gauges?: readonly RiverGaugeReading[];
  moorings?: MooringSection;
  at: number;
  timeLabel?: string;
  dateTime?: string;
  sequence?: boolean;
  reconstruction?: boolean;
  photograph?: { url: string; alt: string };
  marks?: readonly ObservationMark[];
  markWindow?: { from: number; to: number; showAhead: boolean };
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
  id?: string;
  gapAfter?: number;
  secondary?: boolean;
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

type FaultPoint = GeoPoint & { depth: number };

export interface ObservationFault {
  patches: readonly { corners: readonly FaultPoint[]; start: number; rise: number; tint: number }[];
  guides: readonly FaultPoint[];
  exaggeration: number;
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
  /** Split in longitudinal UV space for a surface containing the before and after surveys stacked vertically. */
  surveyDivider?: number;
  curtain?: {
    points: readonly GeoPoint[];
    heightKm: number;
    exaggeration: number;
    image: HTMLImageElement;
    down?: boolean;
    moorings?: MooringSection | undefined;
  };
  terrain?: { grid: ObservationTerrain; progress: number };
  fault?: { model: ObservationFault; seconds: number; amount: number };
  moonImage?: HTMLImageElement | null;
  onPick?: ((point: GeoPoint) => void) | undefined;
  pickOnGlobe?: boolean;
  lens?: { globe: number; map: number };
  sky?: TonightView | undefined;
  follow?: ReplayCamera | undefined;
  shadow?: { point: GeoPoint; pose: CameraState } | undefined;
  arrive?: (scale: number, reduced: boolean) => void;
  /** Called once the requested projection, flight and regional lens are all in place. */
  comparisonFrame?: { map: boolean; onReady: () => void };
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
