import { LAT_LIMIT, ZOOM_MAX } from "../globe/framing";
import type { SourceId } from "../data/types";
import type { RampName } from "../globe/ramp";
import type { SectionLine } from "./section";
import { isArchivableDay } from "./day";
import { nearestWindow } from "./windows";
import { readStoryMoment, writeStoryMoment, type StoryMoment } from "./observations/storyMoment";
// Import the bounds, don't retype them. A retyped bound is what caused the clamp bug in `decode`.
import { MAG_MAX, MAG_MIN } from "../globe/ramp";

/* "Look at this" as a link. See ARCHITECTURE.md#srcapppermalinkts. */

export interface Permalink {
  story?: StoryMoment | undefined;
  lon: number;
  lat: number;
  zoom: number;
  minMagnitude: number;
  windowHours: number;
  sources: SourceId[];
  ramp: RampName;
  flat?: boolean;
  presentation?: "observe" | "explore";
  /** `source:id`, or null. Not our internal key. */
  event: string | null;
  /** The two ends of the cross-section, or null. A link with one always lands on the map, because that is the only place a section exists. */
  section: SectionLine | null;
  /** The moment the cursor sat on, in epoch milliseconds, or null for live. Absolute, so it means the same moment to whoever opens it. */
  cursor: number | null;
  /** The archived day, `YYYY-MM-DD`, or null when live. The day and not the span, because the span is derived from it and two copies could disagree. */
  day: string | null;
  /** The chosen storm, volcano, fire or flood as `kind:id`, or null. The agency's id, so it still names the same thing on another machine. */
  mark: string | null;
}

// Two places, not fourteen. A URL claiming the camera to fourteen decimals is claiming precision
// nobody can aim with.
const round = (value: number, places: number): number => Number(value.toFixed(places));
/** Longitude back into [-180, 180). The camera's is not. See ARCHITECTURE.md#srcapppermalinkts. */
const wrapLon = (lon: number): number => {
  // Leave it alone when it already fits. The modulo turns 145.8 into 145.79999999999995, and then a
  // section stops equalling itself after a round trip.
  if (lon >= -180 && lon < 180) return lon;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
};

export function encode(state: Permalink): string {
  const parts = [
    `at=${round(wrapLon(state.lon), 2)},${round(state.lat, 2)},${round(state.zoom, 2)}`,
    `m=${round(state.minMagnitude, 1)}`,
    `w=${Math.round(state.windowHours)}`,
    `s=${[...state.sources].sort().join(",")}`,
    `r=${state.ramp}`,
  ];
  if (state.flat !== undefined) parts.push(`p=${state.flat ? "map" : "globe"}`);
  if (state.presentation) parts.push(`v=${state.presentation}`);
  if (state.event) parts.push(`e=${state.event}`);
  // Seconds, not milliseconds. The strip is 24 buckets wide, so a shared moment is good to about a minute.
  if (state.cursor !== null) parts.push(`c=${Math.round(state.cursor / 1000)}`);
  if (state.day) parts.push(`d=${state.day}`);
  if (state.mark) parts.push(`k=${state.mark}`);
  if (state.section) {
    const { fromLon, fromLat, toLon, toLat } = state.section;
    parts.push(
      `x=${round(wrapLon(fromLon), 2)},${round(fromLat, 2)}` +
        `,${round(wrapLon(toLon), 2)},${round(toLat, 2)}`,
    );
  }
  if (!state.story) return parts.join("&");
  const params = new URLSearchParams(parts.join("&"));
  writeStoryMoment(params, state.story);
  return params.toString();
}

const SOURCES: readonly string[] = ["usgs", "emsc"];
const RAMPS: readonly string[] = ["thermal", "cividis"];

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

/** A fragment back into state. Treat every field as untrusted: people edit URLs and chat clients cut them off. */
export function decode(fragment: string): Partial<Permalink> {
  const out: Partial<Permalink> = {};
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const story = readStoryMoment(params);
  if (story) out.story = story;

  const projection = params.get("p");
  if (projection === "map" || projection === "globe") out.flat = projection === "map";
  const presentation = params.get("v");
  if (presentation === "observe" || presentation === "explore") out.presentation = presentation;

  const at = params.get("at")?.split(",").map(Number);
  if (at && at.length === 3 && at.every((n) => Number.isFinite(n))) {
    out.lon = wrapLon(at[0]!);
    out.lat = clamp(at[1]!, -LAT_LIMIT, LAT_LIMIT);
    /*
     * Sanity only. The real floor depends on the viewport, which the decoder does not have: it is 0.64
     * on a desktop map and 0.19 on a phone. `flyTo` re-clamps every shared camera against the live frame.
     */
    out.zoom = clamp(at[2]!, 0.05, ZOOM_MAX);
  }

  const m = Number(params.get("m"));
  // The slider's own bounds, not round numbers near them. Hard-coded 0 and 7 turned a shared 7.5 into 7.
  if (params.has("m") && Number.isFinite(m)) out.minMagnitude = clamp(m, MAG_MIN, MAG_MAX);

  /*
   * Snap to a window the app offers. A plain clamp to 1-24 turned a link to a month into a day and said
   * nothing, and a 100-hour window would leave the window group with nothing selected.
   */
  const w = Number(params.get("w"));
  if (params.has("w") && Number.isFinite(w)) out.windowHours = nearestWindow(w);

  // A real calendar date, not the right shape. `2026-02-31` matches the pattern and `Date.parse` rolls it
  // quietly into March. `day.ts` owns this rule, so don't write a second copy here.
  const day = params.get("d");
  if (day !== null && isArchivableDay(day, Date.now())) out.day = day;

  // Check the kind, not the id. The id half belongs to an agency and this app should not guess its shape.
  const mark = params.get("k");
  if (mark !== null && /^(cyclone|volcano|fire|flood):.+/.test(mark)) out.mark = mark;

  const s = params.get("s");
  if (s !== null) {
    const chosen = s.split(",").filter((id): id is SourceId => SOURCES.includes(id));
    // An empty list is a real state meaning "show nothing", so honour it rather than treat it as absent.
    out.sources = chosen;
  }

  const r = params.get("r");
  if (r && RAMPS.includes(r)) out.ramp = r as RampName;

  const e = params.get("e");
  if (e && /^(usgs|emsc):[\w.-]{1,64}$/.test(e)) out.event = e;

  // Earlier epochs belong to explicit, validated archive days; undated moments retain the live bounds.
  const c = Number(params.get("c"));
  if (
    params.get("c")?.trim() &&
    Number.isFinite(c) &&
    Math.abs(c) < 100_000_000_000 &&
    (c > 1_000_000_000 || out.day !== undefined)
  ) {
    out.cursor = c * 1000;
  }

  const x = params.get("x")?.split(",").map(Number);
  if (x && x.length === 4 && x.every((n) => Number.isFinite(n))) {
    const line = {
      fromLon: wrapLon(x[0]!),
      fromLat: clamp(x[1]!, -90, 90),
      toLon: wrapLon(x[2]!),
      toLat: clamp(x[3]!, -90, 90),
    };
    // Both ends in one place matches nothing and reads as a broken link. The drag cannot make one, so
    // it only ever arrives from a URL somebody typed.
    if (line.fromLon !== line.toLon || line.fromLat !== line.toLat) out.section = line;
  }

  return out;
}
