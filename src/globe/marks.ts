import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import { DEG } from "../geo/sphere";
import { morphable } from "./morph";
import type { Point } from "./shapes";

/* Every mark that is not an earthquake, in one layer. It knows nothing about storms or volcanoes: it draws
   achromatic polylines in lon/lat, above the boundaries and below the markers. See ARCHITECTURE.md. */

/** Above the plate boundaries these things sit on, below the land that contains them. */
const RADIUS = 1.004;
/** Segments held. Sized against the worst day the feeds can produce: GDACS caps each list at 100, which
 * lands near 5,100 segments, doubled from there. Guessing low means marks silently missing from the far
 * end of the list. */
const CAPACITY = 12000;
/* One glyph's worth of segments. A flood is three strokes sharing an id and a densified spiral is the
 * longest single shape, both well under a hundred segments. 512 is a guard, not a budget. */
const HIGHLIGHT_CAPACITY = 512;
/** Longest leg before it is split, so a chord does not cut inside the globe. */
const DENSIFY_DEG = 1.5;
/** Beyond this a leg is a wrap across the antimeridian, not a mark crossing it. */
const WRAP_DEG = 170;

export type Polyline = readonly Point[];

/**
 * One drawn thing, and whether it is a symbol or a place. `anchor` is the point the glyph stands on, and
 * its presence is what marks the shape as a symbol held at a constant size on screen.
 */
export interface Mark {
  points: Polyline;
  anchor?: Point;
  /** What this mark is, for picking: `kind:id`, or absent for geometry nothing can be clicked. An anchor is
   * already where the mark is; this says which thing it is. */
  id?: string;
  /** What the hover tooltip says. The label lives on the mark rather than being looked up by the globe,
   * because the globe knows about polylines and deliberately nothing about cyclones. */
  label?: string;
}

/** The zoom the glyph sizes in `shapes.ts` are tuned for. Chosen by looking: at 2.5 the flames read as what
 * they are without crowding the markers. */
const REFERENCE_ZOOM = 2.5;
/** Clamped, because the zoom range runs to 0.05 and 50x a flame is a continent with a tip on it. */
const MIN_SCALE = 0.6;
const MAX_SCALE = 6;
/** Rebuilds only past this much change, so a wheel gesture is a few rebuilds and not one per frame. */
const SCALE_STEP = 0.08;

export function scaleFor(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, REFERENCE_ZOOM / zoom));
}

export interface MarkLayer {
  object: LineSegments;
  /** The hovered glyph, redrawn bright over itself. A separate object because the marks live in one geometry
   * with one colour, and brightening one glyph in a soup needs a per-vertex attribute and a shader. */
  highlight: LineSegments;
  set: (marks: readonly Mark[]) => void;
  /** The `kind:id` under the pointer, or null. Highlights every stroke sharing that id. */
  setHovered: (id: string | null) => void;
  /** The camera moved. Rebuilds only when the glyph scale has moved enough to see. */
  setZoom: (zoom: number) => void;
  dispose: () => void;
}

export function createMarkLayer(morph: { value: number }): MarkLayer {
  const positions = new Float32Array(CAPACITY * 6);
  const lonLats = new Float32Array(CAPACITY * 4);
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  const llAttr = new BufferAttribute(lonLats, 2);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aLonLat", llAttr);
  geometry.setDrawRange(0, 0);

  const material = new LineBasicMaterial({ color: 0x9fb0cc, transparent: true, opacity: 0.72 });
  morphable(material, morph);
  const object = new LineSegments(geometry, material);
  /* Above the night, like the earthquakes are. At 3.5 these sat under the coastline and under the night
     overlay while earthquakes draw at 5, so a storm faded at night and a quake beside it did not. See
     ARCHITECTURE.md. */
  object.renderOrder = 5.5;

  /* The hover highlight is the glyph's own shape, in ink, over itself. A ring round a spiral argued with
     the app's own rule that marks are told apart by shape. See ARCHITECTURE.md. */
  const hotPositions = new Float32Array(HIGHLIGHT_CAPACITY * 6);
  const hotLonLats = new Float32Array(HIGHLIGHT_CAPACITY * 4);
  const hotGeometry = new BufferGeometry();
  const hotPosAttr = new BufferAttribute(hotPositions, 3);
  const hotLlAttr = new BufferAttribute(hotLonLats, 2);
  hotGeometry.setAttribute("position", hotPosAttr);
  hotGeometry.setAttribute("aLonLat", hotLlAttr);
  hotGeometry.setDrawRange(0, 0);
  const hotMaterial = new LineBasicMaterial({ color: 0xd6e4f7 });
  morphable(hotMaterial, morph);
  const highlight = new LineSegments(hotGeometry, hotMaterial);
  // Above the marks it sits on, below the markers and their rings.
  // Just above the glyphs it traces, so it stays with them wherever they are drawn.
  highlight.renderOrder = 5.6;

  let written = 0;
  const put = (aLon: number, aLat: number, bLon: number, bLat: number): void => {
    if (written >= CAPACITY) return;
    const i = written * 6;
    const j = written * 4;
    const pa = aLat * DEG;
    const la = aLon * DEG;
    const ca = Math.cos(pa) * RADIUS;
    positions[i] = ca * Math.sin(la);
    positions[i + 1] = Math.sin(pa) * RADIUS;
    positions[i + 2] = ca * Math.cos(la);
    const pb = bLat * DEG;
    const lb = bLon * DEG;
    const cb = Math.cos(pb) * RADIUS;
    positions[i + 3] = cb * Math.sin(lb);
    positions[i + 4] = Math.sin(pb) * RADIUS;
    positions[i + 5] = cb * Math.cos(lb);
    lonLats[j] = aLon;
    lonLats[j + 1] = aLat;
    lonLats[j + 2] = bLon;
    lonLats[j + 3] = bLat;
    written += 1;
  };

  let hotWritten = 0;
  const putHot = (aLon: number, aLat: number, bLon: number, bLat: number): void => {
    if (hotWritten >= HIGHLIGHT_CAPACITY) return;
    const i = hotWritten * 6;
    const j = hotWritten * 4;
    const pa = aLat * DEG;
    const la = aLon * DEG;
    const ca = Math.cos(pa) * RADIUS;
    hotPositions[i] = ca * Math.sin(la);
    hotPositions[i + 1] = Math.sin(pa) * RADIUS;
    hotPositions[i + 2] = ca * Math.cos(la);
    const pb = bLat * DEG;
    const lb = bLon * DEG;
    const cb = Math.cos(pb) * RADIUS;
    hotPositions[i + 3] = cb * Math.sin(lb);
    hotPositions[i + 4] = Math.sin(pb) * RADIUS;
    hotPositions[i + 5] = cb * Math.cos(lb);
    hotLonLats[j] = aLon;
    hotLonLats[j + 1] = aLat;
    hotLonLats[j + 2] = bLon;
    hotLonLats[j + 3] = bLat;
    hotWritten += 1;
  };

  let held: readonly Mark[] = [];
  let hovered: string | null = null;
  let scale = 1;

  /** One tessellation, written wherever it is told. The highlight must trace the same path as the mark. */
  const emit = (marks: readonly Mark[], write: typeof put): void => {
    for (const mark of marks) {
      // Scaled about its own anchor, so the glyph grows where it stands rather than drifting off the thing
      // it marks. Latitude clamped: six times a flame at 88 degrees puts its tip past the pole.
      const { anchor } = mark;
      const shape =
        anchor === undefined || scale === 1
          ? mark.points
          : mark.points.map((p) => ({
              lon: anchor.lon + (p.lon - anchor.lon) * scale,
              lat: Math.max(-89.9, Math.min(89.9, anchor.lat + (p.lat - anchor.lat) * scale)),
            }));
      for (let i = 1; i < shape.length; i += 1) {
        const a = shape[i - 1]!;
        const b = shape[i]!;
        // Dropped rather than drawn, like `buildPlates` drops the same thing: joining 179 to -179 is a
        // hairline straight across the map and a chord through the planet.
        if (Math.abs(b.lon - a.lon) > WRAP_DEG) continue;
        const span = Math.max(Math.abs(b.lon - a.lon), Math.abs(b.lat - a.lat));
        const steps = Math.max(1, Math.ceil(span / DENSIFY_DEG));
        for (let step = 0; step < steps; step += 1) {
          const t0 = step / steps;
          const t1 = (step + 1) / steps;
          write(
            a.lon + (b.lon - a.lon) * t0,
            a.lat + (b.lat - a.lat) * t0,
            a.lon + (b.lon - a.lon) * t1,
            a.lat + (b.lat - a.lat) * t1,
          );
        }
      }
    }
  };

  const build = (): void => {
    written = 0;
    emit(held, put);
    geometry.setDrawRange(0, written * 2);
    posAttr.needsUpdate = true;
    llAttr.needsUpdate = true;
    buildHot();
  };

  const buildHot = (): void => {
    hotWritten = 0;
    if (hovered !== null)
      emit(
        held.filter((m) => m.id === hovered),
        putHot,
      );
    hotGeometry.setDrawRange(0, hotWritten * 2);
    hotPosAttr.needsUpdate = true;
    hotLlAttr.needsUpdate = true;
  };

  return {
    object,
    highlight,
    set: (marks) => {
      held = marks;
      build();
    },
    setHovered: (id) => {
      if (id === hovered) return;
      hovered = id;
      buildHot();
    },
    setZoom: (zoom) => {
      const next = scaleFor(zoom);
      if (Math.abs(next - scale) < SCALE_STEP * scale) return;
      scale = next;
      build();
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      hotGeometry.dispose();
      hotMaterial.dispose();
    },
  };
}

/**
 * The id of the anchored mark nearest a screen point, or null. Screen space rather than geographic, like the
 * marker hit test in `scene.ts`: a pointer is a pixel and a degree is not a constant number of them.
 */
export function pickMark(
  marks: readonly Mark[],
  at: { x: number; y: number },
  project: (lon: number, lat: number) => { x: number; y: number } | null,
  slopPx: number,
): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const mark of marks) {
    if (!mark.anchor || mark.id === undefined) continue;
    const on = project(mark.anchor.lon, mark.anchor.lat);
    // Null means round the back of the globe, which is not clickable however near the pointer looks.
    if (!on) continue;
    const d = Math.hypot(on.x - at.x, on.y - at.y);
    if (d > slopPx || d >= bestD) continue;
    bestD = d;
    best = mark.id;
  }
  return best;
}
