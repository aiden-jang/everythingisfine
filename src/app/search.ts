import { matches } from "../data/filter";
import type { Filters, Quake } from "../data/types";
import type { Store } from "../data/store";
import { place } from "./format";
import { REGIONS, type Region } from "./regions";

/*
 * Somewhere to search, over the only two things this app can honestly search.
 *
 * There is no gazetteer and there cannot be one: every geocoder needs a key. So this searches the eleven
 * authored regions and the place strings the two agencies wrote on the events currently held.
 *
 * That is a real limit with a real consequence: "Paris" finds nothing, because nothing has happened there,
 * and the empty state has to say which of the two it means.
 *
 * Regions rank above places because they are authored navigation and work at zero count: a quiet Kamchatka
 * is still somewhere to go and look.
 */

/** Places are grouped rather than listed: a sequence puts three hundred rows behind one name. */
export interface PlaceHit {
  kind: "place";
  /** Case-normalised, which is also what merges the two agencies' spellings of one name. */
  name: string;
  count: number;
  /** The strongest event there, which is what the row flies to and pins. */
  strongest: Quake;
}

export interface RegionHit {
  kind: "region";
  region: Region;
  count: number;
}

export type Hit = RegionHit | PlaceHit;

export interface Results {
  hits: Hit[];
  /** Places found beyond the cap, so a truncated list can say it was truncated. */
  more: number;
}

/** How many place rows a result list will show before it stops being scannable. */
export const PLACE_LIMIT = 8;

/**
 * Lowercased, unaccented, punctuation flattened to single spaces. The agencies agree on none of those three:
 * USGS writes "72 km E of Petropavlovsk-Kamchatsky, Russia" and EMSC writes "OFF EAST COAST OF KAMCHATKA",
 * and somebody typing "kamchatka" means both.
 */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether a folded needle starts a word in a folded haystack. Word starts rank above bare substrings, so
 * "chile" prefers "Coquimbo, Chile". Without it the ordering is the store's arrival order.
 */
function atWordStart(hay: string, needle: string): boolean {
  const i = hay.indexOf(needle);
  if (i < 0) return false;
  return i === 0 || hay[i - 1] === " ";
}

/**
 * What the query matches, regions first, then places by relevance and then by size. One pass over the store:
 * the region counts and the place groups come out of the same walk.
 */
export function search(
  query: string, store: Store, filters: Filters, now: number,
): Results {
  const needle = fold(query);
  if (needle.length < 2) return { hits: [], more: 0 };

  const regionHits = REGIONS
    .map((region) => ({ region, folded: fold(region.name) }))
    .filter(({ folded }) => folded.includes(needle))
    .map(({ region, folded }) => ({ region, lead: atWordStart(folded, needle) }));

  const regionCounts = new Map<string, number>();
  const places = new Map<string, { count: number; strongest: Quake; lead: boolean }>();

  store.forEach((quake) => {
    if (!matches(quake, filters, now)) return;
    const { lon, lat } = quake.primary;
    for (const { region } of regionHits) {
      const [w, s, e, n] = region.bounds;
      if (lat < s || lat > n) continue;
      const inside = w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
      if (inside) regionCounts.set(region.name, (regionCounts.get(region.name) ?? 0) + 1);
    }

    const name = place(quake.primary.place);
    const folded = fold(name);
    if (!folded.includes(needle)) return;
    const held = places.get(name);
    if (held === undefined) {
      places.set(name, { count: 1, strongest: quake, lead: atWordStart(folded, needle) });
      return;
    }
    held.count += 1;
    if (quake.primary.magnitude > held.strongest.primary.magnitude) held.strongest = quake;
  });

  const regions: RegionHit[] = regionHits
    .sort((a, b) => Number(b.lead) - Number(a.lead) || a.region.name.localeCompare(b.region.name))
    .map(({ region }) => ({ kind: "region", region, count: regionCounts.get(region.name) ?? 0 }));

  const ranked = [...places.entries()]
    .sort(([an, a], [bn, b]) => Number(b.lead) - Number(a.lead)
      || b.strongest.primary.magnitude - a.strongest.primary.magnitude
      || an.localeCompare(bn));

  const placeHits: PlaceHit[] = ranked.slice(0, PLACE_LIMIT).map(([name, p]) => ({
    kind: "place", name, count: p.count, strongest: p.strongest,
  }));

  return { hits: [...regions, ...placeHits], more: Math.max(0, ranked.length - PLACE_LIMIT) };
}
