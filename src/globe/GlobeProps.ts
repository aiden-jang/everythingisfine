import type { InspectionRun } from "../app/useEventInspection";
import type { FlyTo } from "./cameraTarget";
import type { CutawayFocus } from "./cutaway";
import type { CameraState } from "./controls";
import type { SectionCommit } from "./sectionDrawing";
import type { FigureTable } from "../geo/stars";
import type { GlobeMoment } from "./scene";
import type { GlobePresentation } from "./scenePresentation";
import type { FocusSpan } from "./events";
import type { Feed } from "../app/feed";
import type { Filters } from "../data/types";
import type { RampName } from "./ramp";
import type { SectionLine } from "../app/section";
import type { Aurora } from "../sources/aurora";
import type { SlabPoint } from "../geo/slab";
import type { Mark } from "./marks";

export interface GlobeProps {
  feed: Feed;
  filters: Filters;
  selected: string | null;
  ramp: RampName;
  onSelect: (key: string | null) => void;
  onReady: (flyTo: FlyTo, read: () => CameraState) => void;
  /** Hands out a function that renders and returns the canvas, for the still. See ARCHITECTURE.md#srcglobeglobepropsts. */
  onFrame?: (source: HTMLCanvasElement) => void;
  onCapture?: (capture: () => HTMLCanvasElement | null) => void;
  onSelectMark?: (id: string | null) => void;
  onCamera?: (state: { lon: number; lat: number; zoom: number }) => void;
  /** Replay counts events, rather than the smaller number of clustered markers. */
  onReplay?: (state: { at: number; revealed: number } | null) => void;
  flat?: boolean;
  globePresentation?: GlobePresentation;
  rotateLanding?: boolean;
  /** Draw earthquakes at their own depth. Only means anything on the globe, and the shader fades it with
   * the morph, so unwrapping the map lifts every event back to the surface as one motion. */
  depthSink?: boolean;
  cutaway?: CutawayFocus | null;
  figures?: FigureTable | null;
  /** Null rather than `Date.now()` on the live view, so the scene keeps its once-a-minute throttle. */
  moment?: GlobeMoment;
  inspection?: InspectionRun | null;
  /** Handed in already loaded: whoever pressed the toggle pulls the chunk, and this stays a renderer. */
  slab?: readonly SlabPoint[] | null;
  /** A span, not a bucket index: the strip knows how wide its buckets are and this does not. */
  focus?: FocusSpan | null;
  aurora?: Aurora | null;
  marks?: readonly Mark[];
  /** Origin time the cursor stands at, or null for live. Null means no limit rather than "the present",
   * so a live arrival still appears. */
  scrubAt?: number | null;
  section?: SectionLine | null;
  /** Map only: picking two points on a sphere somebody is rotating is a guess. Shift and drag, because a
   * plain drag already pans and a "now draw a line" button would be a mode to get stuck in. */
  onSection?: SectionCommit;
}
