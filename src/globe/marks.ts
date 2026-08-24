import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import { DEG } from "../geo/sphere";
import { morphable } from "./morph";
import type { Point } from "./shapes";

/*
 * Every mark that is not an earthquake, in one layer.
 *
 * Generalised out of the cyclone layer when volcanoes became the third phenomenon and wildfires and floods
 * were queued behind them. Four near-identical `LineSegments` layers is four places to fix the same seam
 * bug, and this app has already paid for that lesson once in the land mesh.
 *
 * It knows nothing about storms or volcanoes. It draws polylines in longitude and latitude, achromatic,
 * above the boundaries they sit on and below the markers that carry meaning. What shape a phenomenon gets
 * is decided in `shapes.ts`, and which shapes exist is decided in `app/marks.ts`.
 *
 * **A glyph holds its size on screen; a track does not.** The glyphs were built in degrees on the argument
 * that they are things on the ground, and looking at the result killed that argument: at the framing the
 * app opens on, a flame is five pixels of thin grey line and a hundred fires are invisible under a legend
 * describing them. The markers settled this question long ago for the same reason - constant pixel size,
 * so zooming separates marks rather than magnifying them - and a symbol that stands for a fire belongs on
 * that side of it. A cyclone track is not a symbol, it is measured geography, so it scales with the
 * coastline it is drawn against. That is what `anchor` distinguishes.
 */

/** Above the plate boundaries these things sit on, below the land that contains them. */
const RADIUS = 1.004;
/**
 * Segments held.
 *
 * Sized against the worst day the feeds can produce rather than against today: GDACS caps each list at
 * 100, so the ceiling is 100 flames at ~10 segments, 100 floods at three strokes of twelve, 23 volcano
 * triangles and a season's worth of storm track, which lands near 5,100. Doubled from there, because the
 * failure mode of guessing low is marks silently missing from the far end of the list.
 */
const CAPACITY = 12000;
/*
 * One glyph's worth of segments, with room to spare.
 *
 * A flood is three strokes sharing an id and a densified spiral is the longest single shape, which comes
 * to well under a hundred segments at any zoom. 512 is a guard, not a budget.
 */
const HIGHLIGHT_CAPACITY = 512;
/** Longest leg before it is split, so a chord does not cut inside the globe. */
const DENSIFY_DEG = 1.5;
/** Beyond this a leg is a wrap across the antimeridian, not a mark crossing it. */
const WRAP_DEG = 170;

export type Polyline = readonly Point[];

/**
 * One drawn thing, and whether it is a symbol or a place.
 *
 * `anchor` is the point the glyph stands on, and its presence is what marks the shape as a symbol to be
 * held at a constant size on screen. A shape without one is geography and is drawn exactly as given.
 */
export interface Mark {
  points: Polyline;
  anchor?: Point;
  /**
   * What this mark is, for picking. `kind:id`, or absent for geometry nothing can be clicked.
   *
   * The five layers added this session were inert: five kinds of mark on the globe carrying real
   * measurements - a storm's peak wind, a fire's burned area - and no way to ask any of them a question,
   * while the earthquakes beside them opened a panel. An anchor is already where the mark *is*; this says
   * which thing it is, which is the only missing half of picking one.
   */
  id?: string;
  /**
   * What the hover tooltip says about this mark.
   *
   * The label lives on the mark rather than being looked up by the globe, because the globe knows about
   * polylines and anchors and deliberately nothing about cyclones. Absent wherever `id` is absent: unlabelled
   * geometry is not hoverable for the same reason it is not clickable.
   */
  label?: string;
}

/**
 * The zoom the glyph sizes in `shapes.ts` are tuned for.
 *
 * Chosen by looking: at 2.5 the flames and the flood waves read as what they are without crowding the
 * markers. Everything else is that size divided by how far in the camera has come.
 */
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
  /**
   * The hovered glyph, redrawn bright over the top of itself.
   *
   * A separate object because the marks live in one geometry with one colour: brightening a single glyph
   * inside a soup would mean a per-vertex attribute and a shader that reads it, for one line of feedback.
   */
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
  object.renderOrder = 3.5;

  /*
   * The hover highlight: the glyph's own shape, in ink, over itself.
   *
   * A ring around a spiral was generic and argued with the app's own rule - marks are told apart by
   * shape, so the thing that says "this one" should speak the same language. Reported from the app.
   *
   * Its own buffers, sized for one glyph rather than the whole layer: a flood is three strokes sharing
   * an id, and a densified spiral is the largest single shape here.
   */
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
  highlight.renderOrder = 3.6;

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
        /*
         * Scaled about its own anchor, so the glyph grows where it stands rather than drifting off the
         * thing it marks. Latitude clamped: six times a flame at 88 degrees would put its tip past the
         * pole, where the projection is still happy to draw it somewhere wrong.
         */
        const { anchor } = mark;
        const shape = anchor === undefined || scale === 1
          ? mark.points
          : mark.points.map((p) => ({
            lon: anchor.lon + (p.lon - anchor.lon) * scale,
            lat: Math.max(-89.9, Math.min(89.9, anchor.lat + (p.lat - anchor.lat) * scale)),
          }));
        for (let i = 1; i < shape.length; i += 1) {
          const a = shape[i - 1]!;
          const b = shape[i]!;
          // Dropped rather than drawn, for the reason `buildPlates` drops the same thing: joining 179 to
          // -179 is a hairline straight across the map and a chord through the planet.
          if (Math.abs(b.lon - a.lon) > WRAP_DEG) continue;
          const span = Math.max(Math.abs(b.lon - a.lon), Math.abs(b.lat - a.lat));
          const steps = Math.max(1, Math.ceil(span / DENSIFY_DEG));
          for (let step = 0; step < steps; step += 1) {
            const t0 = step / steps;
            const t1 = (step + 1) / steps;
            write(
              a.lon + (b.lon - a.lon) * t0, a.lat + (b.lat - a.lat) * t0,
              a.lon + (b.lon - a.lon) * t1, a.lat + (b.lat - a.lat) * t1,
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
    if (hovered !== null) emit(held.filter((m) => m.id === hovered), putHot);
    hotGeometry.setDrawRange(0, hotWritten * 2);
    hotPosAttr.needsUpdate = true;
    hotLlAttr.needsUpdate = true;
  };

  return {
    object,
    highlight,
    set: (marks) => { held = marks; build(); },
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
 * The id of the anchored mark nearest a screen point, or null.
 *
 * Screen space rather than geographic, and the same shape as the marker hit test in `scene.ts`: project
 * each candidate and measure in pixels, because a pointer is a pixel and a degree is not a constant
 * number of them. Ranked by pixel distance, so the mark under the pointer wins rather than whichever the
 * list reached first.
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
