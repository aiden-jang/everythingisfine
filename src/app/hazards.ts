import { spanWords } from "./age";
import { WINDOWS } from "./windows";
import type { Cyclone } from "../sources/cyclones";
import type { Flood } from "../sources/floods";
import type { Volcano } from "../sources/volcanoes";
import type { Wildfire } from "../sources/wildfires";

/* The five layers as a list, because a glyph cannot be reached by keyboard. See ARCHITECTURE.md#srcapphazardsts. */

export interface HazardRow {
  /** `kind:id`, the same identity the globe picks by, so the two cannot disagree. */
  id: string;
  kind: "cyclone" | "volcano" | "fire" | "flood";
  name: string;
  /** The one number worth a column, already formatted, or empty when the feed carries none. */
  measure: string;
  /** How long it has been running, or when the episode ended. Empty when the feed carries no dates. */
  age: string;
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

// Live storms, fires and floods arrive flagged current; an archived day holds none that are.
export function hazardGroups(
  { cyclones, volcanoes, fires, floods }: HazardInput,
  now: number,
  archived = false,
): HazardGroup[] {
  const groups: HazardGroup[] = [];
  const live = !archived;

  if (cyclones.length > 0) {
    groups.push({
      kind: "cyclone",
      label: plural(cyclones.length, "storm", "storms"),
      rows: [...cyclones]
        .sort((a, b) => (b.peakKmh ?? 0) - (a.peakKmh ?? 0))
        .map((c) => ({
          id: `cyclone:${c.id}`,
          kind: "cyclone" as const,
          name: c.name,
          measure: c.peakKmh === null ? "" : `${Math.round(c.peakKmh)} km/h`,
          age: spanWords(c.startedAt, c.endedAt, now, live),
          lon: c.lon,
          lat: c.lat,
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
          id: `fire:${f.id}`,
          kind: "fire" as const,
          name: f.country || "Forest fire",
          // Square kilometres, the unit the legend's total uses, so the two read as the same quantity.
          measure: f.hectares === null ? "" : `${Math.round(f.hectares / 100).toLocaleString("en")} km²`,
          age: spanWords(f.startedAt, f.endedAt, now, live),
          lon: f.lon,
          lat: f.lat,
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
          id: `flood:${f.id}`,
          kind: "flood" as const,
          name: f.country || "Flood",
          measure: "",
          age: spanWords(f.startedAt, f.endedAt, now, live),
          lon: f.lon,
          lat: f.lat,
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
          id: `volcano:${v.id}`,
          kind: "volcano" as const,
          name: v.name,
          // Never ongoing: no keyless feed says which volcanoes are erupting, so this dates the episode.
          measure: v.country,
          age: spanWords(null, v.endedAt, now, false),
          lon: v.lon,
          lat: v.lat,
        })),
    });
  }

  return groups;
}

/** How many marks are listed, for the section's own heading. */
export function hazardCount(groups: readonly HazardGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0);
}

/** What a layer holds against what the window kept, so the key can name the ones the filter emptied. */
export interface LayerTally {
  kind: HazardRow["kind"];
  /** How many the feed carries, before the window. */
  held: number;
  shown: number;
  /** The most recent date in the layer, for saying how far back the reader would have to widen. */
  newest: number | null;
}

const PLURAL: Record<HazardRow["kind"], string> = {
  cyclone: "storms",
  fire: "fires",
  flood: "floods",
  volcano: "volcanoes",
};

/** "Storms and volcanoes" from a list of kinds, so the sentence reads rather than enumerates. */
function names(kinds: readonly HazardRow["kind"][]): string {
  const words = kinds.map((k) => PLURAL[k]);
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/* Four layers can empty at once, and four rows vanishing in silence reads as a broken app. */
export function outsideWindowNote(layers: readonly LayerTally[], now: number): string | null {
  const gone = layers.filter((l) => l.shown === 0 && l.held > 0);
  if (gone.length === 0) return null;
  const held = gone.reduce((n, l) => n + l.held, 0);
  const newest = gone.reduce<number | null>(
    (best, l) => (l.newest === null ? best : best === null ? l.newest : Math.max(best, l.newest)),
    null,
  );
  const since =
    newest === null ? "" : ` the newest ${Math.max(0, Math.round((now - newest) / 86_400_000))} days back,`;
  const subject =
    gone.length === layers.length ? "None of the marks are" : `No ${names(gone.map((l) => l.kind))} are`;
  // The smallest window that reaches them, named. A month to see a three-day-old flood buries it.
  const reach =
    newest === null ? null : (WINDOWS.find((w) => now - newest <= w.hours * 3_600_000)?.label ?? null);
  const advice = reach === null ? "so widen the window to see them." : `so try ${reach}.`;
  return `${subject} in this window. The feed holds ${held},${since} ${advice}`;
}
