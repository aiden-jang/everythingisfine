import type { SourceId } from "../data/types";
import type { RampName } from "../globe/ramp";

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
const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

export function encode(state: Permalink): string {
  const parts = [
    `at=${round(wrapLon(state.lon), 2)},${round(state.lat, 2)},${round(state.zoom, 2)}`,
    `m=${round(state.minMagnitude, 1)}`,
    `w=${Math.round(state.windowHours)}`,
    `s=${[...state.sources].sort().join(",")}`,
    `r=${state.ramp}`,
  ];
  if (state.event) parts.push(`e=${state.event}`);
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
    out.lon = ((((at[0]! + 180) % 360) + 360) % 360) - 180;
    out.lat = clamp(at[1]!, -85, 85);
    out.zoom = clamp(at[2]!, 0.75, 3);
  }

  const m = Number(params.get("m"));
  if (params.has("m") && Number.isFinite(m)) out.minMagnitude = clamp(m, 0, 7);

  const w = Number(params.get("w"));
  if (params.has("w") && Number.isFinite(w)) out.windowHours = clamp(Math.round(w), 1, 24);

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

  return out;
}
