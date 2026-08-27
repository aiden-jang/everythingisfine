import type { Cyclone } from "../sources/cyclones";
import type { Flood } from "../sources/floods";
import type { Volcano } from "../sources/volcanoes";
import type { Wildfire } from "../sources/wildfires";

/*
 * The five layers as a list, because a glyph cannot be reached by keyboard.
 *
 * Marks became clickable, which gave them a pointer and nothing else. The earthquakes have had the rail's
 * list from the start.
 *
 * Order each layer by what it is about: storms by wind, fires by area, floods and volcanoes by recency. An
 * alphabetical list of a hundred fires answers nothing.
 */

export interface HazardRow {
  /** `kind:id`, the same identity the globe picks by, so the two cannot disagree. */
  id: string;
  kind: "cyclone" | "volcano" | "fire" | "flood";
  name: string;
  /** The one number worth a column, already formatted, or empty when the feed carries none. */
  measure: string;
  lon: number;
  lat: number;
}

export interface HazardGroup {
  kind: HazardRow["kind"];
  /** Plural label with its count, so a collapsed group still says how much is in it. */
  label: string;
  rows: HazardRow[];
}

export interface HazardInput {
  cyclones: readonly Cyclone[];
  volcanoes: readonly Volcano[];
  fires: readonly Wildfire[];
  floods: readonly Flood[];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function hazardGroups({ cyclones, volcanoes, fires, floods }: HazardInput): HazardGroup[] {
  const groups: HazardGroup[] = [];

  if (cyclones.length > 0) {
    groups.push({
      kind: "cyclone",
      label: plural(cyclones.length, "storm", "storms"),
      rows: [...cyclones]
        .sort((a, b) => (b.peakKmh ?? 0) - (a.peakKmh ?? 0))
        .map((c) => ({
          id: `cyclone:${c.id}`, kind: "cyclone" as const, name: c.name,
          measure: c.peakKmh === null ? "" : `${Math.round(c.peakKmh)} km/h`,
          lon: c.lon, lat: c.lat,
        })),
    });
  }

  if (fires.length > 0) {
    groups.push({
      kind: "fire",
      label: plural(fires.length, "fire", "fires"),
      rows: [...fires]
        .sort((a, b) => (b.hectares ?? 0) - (a.hectares ?? 0))
        .map((f) => ({
          id: `fire:${f.id}`, kind: "fire" as const, name: f.country || "Forest fire",
          // Square kilometres, the unit the legend's total uses, so the two read as the same quantity.
          measure: f.hectares === null ? "" : `${Math.round(f.hectares / 100).toLocaleString("en")} km²`,
          lon: f.lon, lat: f.lat,
        })),
    });
  }

  if (floods.length > 0) {
    groups.push({
      kind: "flood",
      label: plural(floods.length, "flood", "floods"),
      // Newest first. There is no severity in this feed to rank by, and inventing an order would imply one.
      rows: [...floods]
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
        .map((f) => ({
          id: `flood:${f.id}`, kind: "flood" as const, name: f.country || "Flood",
          measure: "", lon: f.lon, lat: f.lat,
        })),
    });
  }

  if (volcanoes.length > 0) {
    groups.push({
      kind: "volcano",
      label: plural(volcanoes.length, "volcano", "volcanoes"),
      rows: [...volcanoes]
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
        .map((v) => ({
          id: `volcano:${v.id}`, kind: "volcano" as const, name: v.name,
          measure: v.country, lon: v.lon, lat: v.lat,
        })),
    });
  }

  return groups;
}

/** How many marks are listed, for the section's own heading. */
export function hazardCount(groups: readonly HazardGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0);
}

