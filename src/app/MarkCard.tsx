import { category, type Cyclone } from "../sources/cyclones";
import type { Flood } from "../sources/floods";
import type { Volcano } from "../sources/volcanoes";
import type { Wildfire } from "../sources/wildfires";
import { ago, latLon } from "./format";

/*
 * What a storm, a volcano, a fire or a flood says when you point at it.
 *
 * The five layers arrived able to be seen and not asked. Each one carries measurements the legend could
 * only summarise across the whole set - this storm's peak wind, this fire's burned area and how long it
 * has been alight - and clicking a mark had no effect at all while the earthquake beside it opened a
 * panel. That asymmetry is what this closes.
 *
 * **Every line is a fact from the feed.** Where a feed does not carry something, the row is absent rather
 * than showing a dash: the app's rule about not implying data it does not have applies here as much as it
 * does to a flood's missing severity.
 *
 * Deliberately not the earthquake panel. That one is built around a reading two agencies dispute, with
 * depth, neighbours, arrival times and a sequence; none of those exist for a wildfire, and reshaping it to
 * hold both would make it worse at the thing it is good at.
 */

export type MarkSubject =
  | { kind: "cyclone"; subject: Cyclone }
  | { kind: "volcano"; subject: Volcano }
  | { kind: "fire"; subject: Wildfire }
  | { kind: "flood"; subject: Flood };

/** `kind:id` back to the thing itself, or null when the mark has aged out of its feed. */
export function findSubject(
  id: string | null,
  data: {
    cyclones: readonly Cyclone[]; volcanoes: readonly Volcano[];
    fires: readonly Wildfire[]; floods: readonly Flood[];
  },
): MarkSubject | null {
  if (!id) return null;
  const cut = id.indexOf(":");
  const kind = id.slice(0, cut);
  const key = id.slice(cut + 1);
  if (kind === "cyclone") {
    const subject = data.cyclones.find((c) => c.id === key);
    return subject ? { kind, subject } : null;
  }
  if (kind === "volcano") {
    const subject = data.volcanoes.find((v) => v.id === key);
    return subject ? { kind, subject } : null;
  }
  if (kind === "fire") {
    const subject = data.fires.find((f) => f.id === key);
    return subject ? { kind, subject } : null;
  }
  if (kind === "flood") {
    const subject = data.floods.find((f) => f.id === key);
    return subject ? { kind, subject } : null;
  }
  return null;
}

interface Line { label: string; value: string }

/**
 * The rows for a subject, as facts. Split out from the markup so it can be asserted without a DOM.
 *
 * `archived` moves the tense, for the reason the layer sentences needed it too: these notes read "running
 * now" and "burning now", which was safe only while an archived day withheld the four layers entirely.
 * Now that a past day draws them, a card opened on 2026-05-15 was calling a fire that ended in May a fire
 * burning this minute - on the one surface a reader opens *because* they want the detail.
 */
export function linesFor(
  found: MarkSubject, now: number, archived = false,
): { title: string; note: string; lines: Line[] } {
  if (found.kind === "cyclone") {
    const c = found.subject;
    const rank = category(c.peakKmh);
    return {
      title: c.name,
      note: `Tropical cyclone, running ${archived ? "that day" : "now"}.`,
      lines: [
        { label: "Position", value: latLon(c.lon, c.lat) },
        ...(c.peakKmh === null ? [] : [{
          label: "Peak wind",
          // The number and the scale together: GDACS's own text classifies a different moment, so a
          // storm measured at 259 km/h is filed under "Tropical Storm". See `cyclones.ts`.
          value: `${Math.round(c.peakKmh)} km/h${rank ? ` · ${rank}` : ""}`,
        }]),
        ...(c.track.length > 1 ? [{ label: "Track", value: `${c.track.length} points` }] : []),
      ],
    };
  }
  if (found.kind === "volcano") {
    const v = found.subject;
    return {
      title: v.name,
      /*
        The second sentence is the one thing this layer must never imply, and it holds either way: not
        erupting now on a live day, not erupting then on an archived one. See `volcanoes.ts`.
      */
      note: `Volcano with a logged eruption episode. Not erupting ${archived ? "then" : "now"}.`,
      lines: [
        ...(v.country ? [{ label: "Country", value: v.country }] : []),
        { label: "Position", value: latLon(v.lon, v.lat) },
        ...(v.endedAt === null ? [] : [{ label: "Episode ended", value: ago(v.endedAt, now, archived) }]),
      ],
    };
  }
  if (found.kind === "fire") {
    const f = found.subject;
    const days = f.startedAt !== null && f.endedAt !== null
      ? Math.max(0, Math.round((f.endedAt - f.startedAt) / 86_400_000))
      : null;
    return {
      title: f.country || "Forest fire",
      note: `Forest fire burning ${archived ? "that day" : "now"}.`,
      lines: [
        { label: "Position", value: latLon(f.lon, f.lat) },
        ...(f.hectares === null ? [] : [{
          label: "Burned",
          value: `${Math.round(f.hectares).toLocaleString("en")} ha`
            + ` · ${Math.round(f.hectares / 100).toLocaleString("en")} km²`,
        }]),
        ...(days === null ? [] : [{ label: "Burning", value: `${days} day${days === 1 ? "" : "s"}` }]),
      ],
    };
  }
  const f = found.subject;
  return {
    title: f.country || "Flood",
    // GDACS files every flood as magnitude zero, so there is nothing to rate it by. See `floods.ts`.
    note: `Flood running ${archived ? "that day" : "now"}. This feed does not rate them.`,
    lines: [
      { label: "Position", value: latLon(f.lon, f.lat) },
      ...(f.startedAt === null ? [] : [{ label: "Since", value: ago(f.startedAt, now, archived) }]),
    ],
  };
}

export interface MarkCardProps {
  found: MarkSubject;
  now: number;
  /** True on an archived day, so the card describes then rather than now. */
  archived?: boolean;
  onClose: () => void;
  onFlyTo: (lon: number, lat: number, zoom?: number) => void;
}

export function MarkCard({ found, now, archived = false, onClose, onFlyTo }: MarkCardProps): JSX.Element {
  const { title, note, lines } = linesFor(found, now, archived);
  const where = found.subject;
  return (
    <aside className="zone-panel panel border-hairline bg-deck p-5 max-xl:border-t xl:border-l">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{found.kind}</span>
        <button
          type="button"
          onClick={onClose}
          /*
            Top-aligned inside its own touch target.

            On a coarse pointer every button gets `min-height: 44px`, which is right - this is a control
            people tap. But a button centres its content, so the 44px box put "esc" fourteen pixels below
            the label it sits beside: measured, both start at the same top and the glyph lands at the
            middle of a box three times its height. The target keeps its size and the text moves to the
            top of it, which is where the eye expects it.
          */
          className="flex cursor-pointer items-start font-mono text-[10.5px] text-faint transition-colors hover:text-ink"
        >
          esc
        </button>
      </div>
      {/*
        The same size the panel's other tenant uses, because it is the same slot.

        A pinned earthquake put its magnitude here at 30px and a mark put its name at 22px, so the header
        changed size depending on what you had clicked - one slot, two identities, and they never appear
        together to justify the difference. 30 is the display step the scale already has; 22 was its only
        use, so unifying removes a step rather than adding one. `leading-tight` already handles the names
        long enough to wrap.
      */}
      <h2 className="mt-2 text-[30px] leading-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{note}</p>

      {/* One rule above the group rather than under every row. See the note on `Field` in DetailPanel. */}
      <dl className="mt-4 border-t border-hairline pt-1.5">
        {lines.map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-[5px]">
            <dt className="text-[11px] text-faint">{label}</dt>
            <dd className="text-right font-mono text-[12px] text-dim tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => onFlyTo(where.lon, where.lat, 2.2)}
          className="cursor-pointer border border-hairline px-3 py-2 text-[11px] text-dim transition-colors hover:bg-raised hover:text-ink"
        >
          Fly here
        </button>
      </div>
    </aside>
  );
}
