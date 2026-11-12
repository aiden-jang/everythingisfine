import type { CameraGuidance } from "./cameraGuidance";
import type { Vector3 } from "three";
import type { TonightView } from "../geo/tonight";
import type { OvalPoint } from "../sources/auroraRoute";

export interface Framing {
  lon: number;
  lat: number;
}

export interface CameraState {
  lon: number;
  lat: number;
  zoom: number;
}

export interface Controls {
  /** Wires up pointer, wheel and keyboard listeners. Returns the detach function. */
  attach: (onChange: () => void) => () => void;
  /** Advances momentum and any reset spring. Returns true while something is still moving. */
  step: (dt: number) => boolean;
  /** Writes the current orientation onto the camera. */
  apply: () => void;
  /**
   * The framing distances, recomputed on resize. Two of them: `distance` fits the ball by whichever of
   * width and height is tighter, and `byHeight` ignores the width, which is what the map wants.
   */
  setFit: (distance: number, byHeight: number) => void;
  /** Geographic point under a client pixel, or null off the globe. Hover in step 9 needs this. */
  pick: (clientX: number, clientY: number) => { lon: number; lat: number } | null;
  /** The whole camera in three numbers. This is exactly what a permalink has to carry. */
  state: () => CameraState;
  /** Springs the camera to a place. Instant under reduced motion, per DESIGN.md section 8. */
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  guidance: CameraGuidance;
  setReplayAngle: (bank: number, pitch: number) => void;
  setView: (pose: CameraState) => void;
  /** Starts a finite horizon pullback. Skipped completely under reduced motion. */
  enter: () => void;
  /** 0 globe, 1 map. Drag becomes a pan and the facing tests fade out as this reaches 1. */
  setMorph: (t: number) => void;
  morph: () => number;
  magnification: () => number;
  setPlanetarium: (on: boolean) => void;
  setLocalSky: (view: TonightView | null, restore: boolean) => void;
  localSky: { amount: () => number; ready: () => boolean; up: Vector3 };
  skyReady: () => boolean;
  setOverflight: (focus: OvalPoint | null) => void;
  auroraSweep: () => number;
  setDive: (on: boolean) => void;
  diveReady: () => boolean;
  framingReady: () => boolean;
  /** Screen position of a geographic point, or null when it is round the back. See ARCHITECTURE.md#srcglobecontrolsts. */
  project: (lon: number, lat: number, radius?: number) => { x: number; y: number } | null;
  /** Degrees of map covered by one screen pixel. Only meaningful once flat. See ARCHITECTURE.md#srcglobecontrolsts. */
  degPerPx: (atZoom?: number) => number;
  /**
   * How far around the globe a pixel offset from the centre actually is.
   *
   * Not `degPerPx * px`. That is the flat map's straight line; this camera sits about two radii out, so
   * the sphere's curve decides, and the two disagree threefold at the distances a panel lift asks about.
   */
  degForPx: (px: number, atZoom?: number) => number;
}
