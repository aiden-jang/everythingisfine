import { category, type Cyclone } from "../sources/cyclones";
import type { Flood } from "../sources/floods";
import type { Volcano } from "../sources/volcanoes";
import type { Wildfire } from "../sources/wildfires";
import { ago, latLon } from "./format";

/* What a storm, volcano, fire or flood says when you click it. Not the earthquake panel. That one is built
   around two agencies disagreeing, and a wildfire has no depth, no neighbours, no arrival time and no
   sequence. See ARCHITECTURE.md#srcappmarkcardtsx. */

export type MarkSubject =
  | { kind: "cyclone"; subject: Cyclone }
  | { kind: "volcano"; subject: Volcano }
  | { kind: "fire"; subject: Wildfire }
  | { kind: "flood"; subject: Flood };

/** `kind:id` back to the thing itself, or null when the mark has aged out of its feed. */
export function findSubject(
  id: string | null,
  data: {
    cyclones: readonly Cyclone[];
    volcanoes: readonly Volcano[];
    fires: readonly Wildfire[];
    floods: readonly Flood[];
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

interface Line {
  label: string;
  value: string;
}

/**
 * The rows for a subject, as facts. Split out from the markup so it can be asserted without a DOM. See
 * ARCHITECTURE.md.
 */
export function linesFor(
  found: MarkSubject,
  now: number,
  archived = false,
): { title: string; note: string; lines: Line[] } {
  if (found.kind === "cyclone") {
    const c = found.subject;
    const rank = category(c.peakKmh);
    return {
      title: c.name,
      note: `Tropical cyclone, running ${archived ? "that day" : "now"}.`,
      lines: [
        { label: "Position", value: latLon(c.lon, c.lat) },
        ...(c.peakKmh === null
          ? []
          : [
              {
                label: "Peak wind",
                // The number and the scale together: GDACS's own text classifies a different moment, so a
                // storm measured at 259 km/h is filed under "Tropical Storm". See `cyclones.ts`.
                value: `${Math.round(c.peakKmh)} km/h${rank ? ` · ${rank}` : ""}`,
              },
            ]),
        ...(c.track.length > 1 ? [{ label: "Track", value: `${c.track.length} points` }] : []),
      ],
    };
  }
  if (found.kind === "volcano") {
    const v = found.subject;
    return {
      title: v.name,
      // The second sentence is the one thing this layer must never imply, and it holds either way: not
      // erupting now on a live day, not erupting then on an archived one.
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
    const days =
      f.startedAt !== null && f.endedAt !== null
        ? Math.max(0, Math.round((f.endedAt - f.startedAt) / 86_400_000))
        : null;
    return {
      title: f.country || "Forest fire",
      note: `Forest fire burning ${archived ? "that day" : "now"}.`,
      lines: [
        { label: "Position", value: latLon(f.lon, f.lat) },
        ...(f.hectares === null
          ? []
          : [
              {
                label: "Burned",
                value:
                  `${Math.round(f.hectares).toLocaleString("en")} ha` +
                  ` · ${Math.round(f.hectares / 100).toLocaleString("en")} km²`,
              },
            ]),
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
}

export function MarkCard({ found, now, archived = false, onClose }: MarkCardProps): JSX.Element {
  const { title, note, lines } = linesFor(found, now, archived);
  return (
    <aside className="zone-panel border-hairline bg-deck p-5 max-xl:border-t xl:border-l">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{found.kind}</span>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer px-2.5 text-[11px] text-dim transition-colors hover:text-ink"
        >
          Close
        </button>
      </div>
      <h2 className="mt-2 text-[20px] leading-tight text-ink">{title}</h2>
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
    </aside>
  );
}
