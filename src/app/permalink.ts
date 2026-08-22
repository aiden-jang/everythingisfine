import type { SourceId } from "../data/types";
import type { RampName } from "../globe/ramp";
import type { SectionLine } from "./section";
import { nearestWindow } from "./windows";
// Data bounds, which happen to live in a rendering module. Restating them here as literals is exactly
// what produced the bug their use fixes.
import { MAG_MAX, MAG_MIN } from "../globe/ramp";

/*
 * "Look at this" as a link.
 *
 * The highest-leverage item in the source doc's section 6, and the cheapest: everything it needs
 * already exists as three numbers, three filters and one identifier. It lives in the fragment, so
 * nothing is sent to a server, which is what keeps the deployment Worker-free.
 *
 * **The selected event is encoded by the agency's identifier, not by ours.** The store's key is
 * `q` plus an arrival counter, which is stable for as long as one page is open and completely
 * meaningless anywhere else: the twelfth event to arrive on my machine is not the twelfth on
 * yours. A link carrying `q12` would restore a *different earthquake*, which is worse than
 * restoring none, because it would look like it worked.
 *
 * `usgs:us7000abcd` is the agency's own name for the event and means the same thing everywhere.
 */

export interface Permalink {
  lon: number;
  lat: number;
  zoom: number;
  minMagnitude: number;
  windowHours: number;
  sources: SourceId[];
  ramp: RampName;
  /** `source:id`, or null. Not our internal key. */
  event: string | null;
  /**
   * The two ends of the cross-section, or null.
   *
   * A section is the one thing in this app somebody makes rather than chooses, so it is the one most
   * worth sending. It also carries its own view: a section only exists on the map, so a link holding
   * one arrives on the map whatever the recipient was last looking at. That is not the projection
   * preference travelling, which is deliberately left out; it is the link saying what it is a section
   * of. Without it the panel would open over a globe with no line drawn on it.
   */
  section: SectionLine | null;
  /**
   * The moment the cursor was standing at, in epoch milliseconds, or null for live.
   *
   * The camera travelled and the clock did not, so "look at this" could say where and never when. That
   * gap became obvious once the largest-event row started parking the cursor: the app's best entry point
   * put you at a moment and produced a link that threw it away.
   *
   * Absolute rather than an offset back from now, because the thing being shared is a moment and not a
   * distance from whenever the recipient happens to open it. The cost is that it can fall out of the
   * window, which is the same cost `event` already pays and is handled the same way: restored if it
   * fits, and said out loud if it does not.
   */
  cursor: number | null;
  /**
   * The archived day being shown, as `YYYY-MM-DD`, or null when this is live.
   *
   * Shipping the archive without this left the link describing a view the app was no longer in: you could
   * load a day in July and the URL still said live. This document argues throughout that a link says
   * where *and when*, and an archived day is the strongest "when" the app has.
   *
   * The day rather than the span, because the span is derived from it and a URL carrying both could
   * disagree with itself. Midnight to midnight UTC, so a shared day is the same day everywhere.
   */
  day: string | null;
  /**
   * The selected non-earthquake mark as `kind:id`, or null.
   *
   * The link already carried which earthquake, which day, which slice and which moment, and not which
   * storm - a gap that arrived with mark selection and is the same one the day had. "Look at this
   * cyclone" is exactly the kind of thing somebody sends.
   *
   * The agencies' own identifiers, like `e=`, so it means something on another machine. A mark that has
   * since dropped out of its feed simply has no card, which `findSubject` already handles: the alternative
   * is a link that resurrects a storm that has blown out.
   */
  mark: string | null;
}

const round = (value: number, places: number): number =>
  Number(value.toFixed(places));

/**
 * Coordinates to two places, zoom to two, magnitude to one.
 *
 * Not for compactness. A longitude written to fourteen decimals in a shared URL is a claim to
 * sub-micron camera precision, and every number in this app is supposed to be honest about what it
 * knows. Two places is about 100 metres of camera position, which is far finer than anyone can aim.
 */
/**
 * Longitude into [-180, 180), because the camera's is not.
 *
 * `lon` accumulates: the spring takes the shortest way round, which means crossing the date line adds
 * or subtracts a turn and nothing ever brings it back. Links were coming out as `at=499.37`, which
 * decodes correctly, since `decode` has always normalised on the way in, and is nonsense to read and
 * to send to somebody.
 */
const wrapLon = (lon: number): number => {
  // Untouched when it is already in range. The modulo form is exact in principle and not in floating
  // point: it turns 145.8 into 145.79999999999995, which survives rounding on the way out and then
  // comes back through `decode` unrounded, so a section did not equal itself after a round trip.
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
  if (state.event) parts.push(`e=${state.event}`);
  // Seconds, not milliseconds. A cursor is read off a strip 24 buckets wide, so a shared moment is
  // meaningful to about a minute and three digits of false precision in a URL is three too many.
  if (state.cursor !== null) parts.push(`c=${Math.round(state.cursor / 1000)}`);
  if (state.day) parts.push(`d=${state.day}`);
  if (state.mark) parts.push(`k=${state.mark}`);
  if (state.section) {
    const { fromLon, fromLat, toLon, toLat } = state.section;
    parts.push(
      `x=${round(wrapLon(fromLon), 2)},${round(fromLat, 2)}`
      + `,${round(wrapLon(toLon), 2)},${round(toLat, 2)}`,
    );
  }
  return parts.join("&");
}

const SOURCES: readonly string[] = ["usgs", "emsc"];
const RAMPS: readonly string[] = ["thermal", "cividis"];

const clamp = (value: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, value));

/**
 * A fragment back into state, defensively.
 *
 * Every field is optional and every one is clamped, because a permalink is untrusted input in the
 * most ordinary way: people edit URLs, chat clients truncate them, and an old link outlives the
 * shape it was written against. Anything unreadable is dropped rather than allowed to put the
 * camera inside the planet or the magnitude filter above every earthquake that has ever happened.
 */
export function decode(fragment: string): Partial<Permalink> {
  const out: Partial<Permalink> = {};
  const params = new URLSearchParams(fragment.replace(/^#/, ""));

  const at = params.get("at")?.split(",").map(Number);
  if (at && at.length === 3 && at.every((n) => Number.isFinite(n))) {
    out.lon = wrapLon(at[0]!);
    out.lat = clamp(at[1]!, -85, 85);
    /*
     * Sanity, and the camera does the rest.
     *
     * This clamped to the globe's 0.75, which is not the map's floor: the map derives its own from the
     * zoom at which the frame is exactly 360 degrees wide, and that is 0.64 at desktop and 0.19 on a
     * phone. So every fully zoomed-out map view shared as 0.75 and arrived up to four times tighter,
     * losing "see everywhere at once", which is the only reason to leave the globe.
     *
     * The real bound is viewport-dependent and the decoder has no viewport. It also does not need one:
     * `flyTo` runs every shared camera through `clampZoom` against the live frame. So this rejects
     * nonsense and leaves the contextual limit to the one place that can know it.
     */
    out.zoom = clamp(at[2]!, 0.05, 3);
  }

  const m = Number(params.get("m"));
  /*
   * The bounds the slider actually has, not a pair of round numbers near them.
   *
   * This read `clamp(m, 0, 7)`. The control runs from `MAG_MIN` to `MAG_MAX`, which are 1 and 7.5, so a
   * filter parked at the top of the scale shared as 7.5 and arrived as 7, and a link could ask for 0,
   * which the slider cannot reach. Both are the sibling of the window bug above: a bound restated as a
   * literal instead of read from the thing it is bounding.
   */
  if (params.has("m") && Number.isFinite(m)) out.minMagnitude = clamp(m, MAG_MIN, MAG_MAX);

  /*
   * Snapped to an offered window, not clamped to a day.
   *
   * This read `clamp(w, 1, 24)`, which was right while a day was the only choice and wrong from the
   * moment 7d and 30d shipped: a link to a month arrived as a day, and nothing said so, which is the
   * worst of the three possible outcomes. Snapping rather than merely widening the clamp follows the
   * rule at the top of this function, that a link must not put the app in a state it has no other way
   * to reach, and a 100-hour window is one: the window group would show nothing selected.
   */
  const w = Number(params.get("w"));
  if (params.has("w") && Number.isFinite(w)) out.windowHours = nearestWindow(w);

  /*
   * A day, only if it is a day.
   *
   * Validated as a real calendar date rather than pattern-matched: `2026-02-31` matches the shape and is
   * not a date, and `Date.parse` would quietly roll it into March. A future day is rejected too - there
   * is nothing to fetch - which follows the rule at the top of this function that a link must not put
   * the app in a state it has no other way to reach.
   */
  const day = params.get("d");
  if (day !== null && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const at = Date.parse(`${day}T00:00:00Z`);
    if (Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day
      && at < Date.now()) out.day = day;
  }

  /*
   * A mark, only if it names a layer this app draws.
   *
   * Validated on the kind rather than accepted whole, because the id half is an agency's and this app has
   * no business guessing its shape. An unknown kind is dropped rather than passed to `findSubject` to come
   * back null, so a hand-edited link fails at the boundary instead of silently doing nothing.
   */
  const mark = params.get("k");
  if (mark !== null && /^(cyclone|volcano|fire|flood):.+/.test(mark)) out.mark = mark;

  const s = params.get("s");
  if (s !== null) {
    const chosen = s.split(",").filter((id): id is SourceId => SOURCES.includes(id));
    // An empty source list is a real state, so it is honoured rather than treated as absent: it
    // means "show nothing", and the rail says so.
    out.sources = chosen;
  }

  const r = params.get("r");
  if (r && RAMPS.includes(r)) out.ramp = r as RampName;

  const e = params.get("e");
  if (e && /^(usgs|emsc):[\w.-]{1,64}$/.test(e)) out.event = e;

  /*
   * Range-checked, not clamped. A cursor is a moment, and there is no nearest valid moment to move an
   * unreadable one to: 1970 and the year 5000 are both simply not what the link meant, so they are
   * dropped the way an unreadable camera is. Whether a well-formed moment is still inside the window is
   * a different question, and one only the app with a buffer in front of it can answer.
   */
  const c = Number(params.get("c"));
  if (params.has("c") && Number.isFinite(c) && c > 1_000_000_000 && c < 100_000_000_000) {
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
    /*
     * A line with both ends in the same place is dropped rather than restored.
     *
     * Its length is zero, so nothing falls inside the corridor and the panel opens to say it found
     * nothing, which reads as a broken link rather than as an edited one. The gesture cannot produce
     * this, since a drag under twelve pixels is treated as a dismissal, so it only arrives from a URL
     * somebody has typed into.
     */
    if (line.fromLon !== line.toLon || line.fromLat !== line.toLat) out.section = line;
  }

  return out;
}
