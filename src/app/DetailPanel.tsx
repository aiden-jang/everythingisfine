import { useMemo, useState } from "react";
import type { Filters, Quake } from "../data/types";
import type { RampName } from "../globe/ramp";
import type { Store } from "../data/store";
import { distanceKm } from "../geo/sphere";
import { depthClass, findNearby, NEARBY_KM } from "./nearby";
import { Sequence } from "./Sequence";
import {
  ago, clock, coordinates, depth, magnitude, place, SOURCE_NAMES,
} from "./format";

/*
 * The pinned event, in full.
 *
 * This panel was 81% empty: ten lines in a 360 by 1187 space. Emptiness was the symptom; the cause
 * was that it only ever said what one feed reported, and for 94% of events only one feed reported.
 * The project's whole subject, two agencies disagreeing, was invisible on almost every event a
 * person could click.
 *
 * So it answers the questions somebody pinning an earthquake actually has, from data already held:
 * how deep and what that means, what else has happened around it, exactly how far apart the two
 * agencies put it, and how to send it to someone.
 */

export interface DetailPanelProps {
  quake: Quake;
  ramp: RampName;
  /** True when the current filters exclude this event, so the globe is not drawing it. */
  excluded: boolean;
  /** The feed's revision, so the neighbour search reruns on new data and not on the clock. */
  revision: number;
  store: Store;
  filters: Filters;
  onClose: () => void;
  onFlyTo: (lon: number, lat: number, zoom?: number) => void;
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-2">
      <span className="text-[11.5px] text-dim">{label}</span>
      <span className="font-mono text-[12px] text-ink">{value}</span>
    </div>
  );
}

export function DetailPanel({
  quake, store, filters, ramp, excluded, revision, onClose, onFlyTo,
}: DetailPanelProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const r = quake.primary;
  /*
   * Recomputed on new data, not on the clock.
   *
   * This walks the whole buffer, and the panel re-renders every second because the rail's clock ticks,
   * so a pinned event was paying for a full pass every second. Measured in a swarm at a full buffer:
   * 56ms, which is three dropped frames a second, for an answer that had not changed. It was written
   * up as a known cost and left live on the argument that memoising would freeze the neighbour list.
   * Keying on the revision keeps it live: the revision moves whenever an earthquake does.
   */
  const near = useMemo(
    () => findNearby(store, quake, filters, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, quake.key, filters, revision],
  );
  /*
   * Per agency, because they revise independently and only one of them may have.
   *
   * Narrowed to a tuple rather than filtered in the markup so the revision is non-optional by the
   * time it is read: `revision!` inside a map is the kind of assertion that survives a refactor and
   * then stops being true.
   */
  const revisions = quake.readings.flatMap((reading) =>
    reading.revision ? [{ reading, revision: reading.revision }] : []);
  const klass = depthClass(r.depthKm);

  /*
   * The disagreement, as a sentence.
   *
   * It is the point of the project and it was only ever implied by two blocks of numbers sitting
   * near each other. Stated in the units a person thinks in, and only when there is genuinely a
   * second reading to disagree with.
   */
  const [a, b] = quake.readings;
  const spread = a && b
    ? {
      km: distanceKm(a.lon, a.lat, b.lon, b.lat),
      seconds: Math.abs(a.time - b.time) / 1000,
      mag: Math.abs(a.magnitude - b.magnitude),
    }
    : null;

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. The address bar already holds the link, so this is a
      // convenience failing rather than the feature failing, and saying nothing is right.
    }
  };

  return (
    <aside className="zone-panel flex w-[360px] flex-col overflow-y-auto border-l border-hairline bg-deck p-5 max-xl:w-full">
      <div className="flex items-start justify-between">
        <div className="label">Pinned event</div>
        <button type="button" onClick={onClose} className="label cursor-pointer hover:text-ink">
          Esc
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[30px] leading-none font-semibold">{magnitude(r)}</span>
        <span className="font-mono text-[12px] text-faint">{r.scale}</span>
      </div>
      <div className="mt-2 text-[13px] leading-snug text-dim">{place(r.place)}</div>
      <div className="mt-1 text-[11.5px] text-faint">
        {clock(r.time)} · {ago(r.time, Date.now())}
      </div>

      {/*
        What the agencies first said, when they have since changed their minds.
        Directly under the magnitude, because it is a statement about that number and nowhere else
        in the panel would connect the two. Absent entirely on the common case, which is no revision:
        a permanent "not revised" line would be four words of chrome saying nothing.
      */}
      {/*
        A pinned event that the filters now exclude.
        Raising the magnitude slider above it left this panel describing an earthquake in full, with
        its depth, its neighbours and its whole sequence, beside a headline reading 0 and a globe with
        nothing on it. Kept rather than closed, because losing a pin to a nudged slider is worse than
        holding one, and named rather than kept quietly.
      */}
      {excluded ? (
        <p className="mt-3 border border-hairline bg-raised p-2.5 text-[11px] leading-relaxed text-dim">
          Outside the current filters, so it is not on the globe. Everything below still describes it.
        </p>
      ) : null}

      {revisions.length > 0 ? (
        <div className="mt-2 border border-hairline bg-raised px-2.5 py-2">
          {revisions.map(({ reading, revision }) => {
            const magMoved = revision.fromMagnitude !== reading.magnitude;
            const depthMoved = revision.fromDepthKm !== null
              && Number.isFinite(reading.depthKm)
              && revision.fromDepthKm !== reading.depthKm;
            return (
              <div key={reading.source} className="text-[11.5px] leading-relaxed text-dim">
                <span className="text-ink">{SOURCE_NAMES[reading.source]}</span> first said{" "}
                {/* Only what actually moved. A revision usually touches one of the two, and printing
                    an unchanged number beside a changed one reads as though both had shifted. */}
                {magMoved ? (
                  <>
                    <span className="font-mono">M {revision.fromMagnitude.toFixed(1)}</span>
                    {" → "}
                    <span className="font-mono">M {reading.magnitude.toFixed(1)}</span>
                  </>
                ) : null}
                {magMoved && depthMoved ? ", " : null}
                {depthMoved ? (
                  <>
                    <span className="font-mono">{Math.round(revision.fromDepthKm!)} km</span>
                    {" → "}
                    <span className="font-mono">{Math.round(reading.depthKm)} km</span>
                    {" deep"}
                  </>
                ) : null}
                {revision.count > 1 ? ` · ${revision.count} changes` : ""}
              </div>
            );
          })}
          <div className="mt-1.5 text-[11px] leading-relaxed text-faint">
            First estimates are automatic. A reviewed magnitude arriving later is the system working,
            not an error.
          </div>
        </div>
      ) : null}

      {r.kind !== "earthquake" ? (
        // Named rather than drawn as an earthquake. A quarry blast is a real seismic event and
        // calling it something it is not would be the quiet kind of lie.
        <div className="mt-2 border border-hairline px-2 py-1 text-[11px] text-dim">
          recorded as a {r.kind}
        </div>
      ) : null}

      <div className="mt-4">
        <Field label="Depth" value={klass ? `${depth(r)} · ${klass}` : depth(r)} />
        <Field label="Position" value={coordinates(r)} />
        <Field
          label="Reported by"
          value={quake.readings.map((x) => SOURCE_NAMES[x.source]).join(" + ")}
        />
      </div>

      {spread ? (
        <div className="mt-4">
          {/*
           * The heading follows the numbers, rather than the numbers following the heading.
           *
           * It read "The two agencies disagree" over 0.0 km, 0.0 s and "same magnitude", which is
           * a caption contradicting the data directly beneath it. Worse, agreement is the *common*
           * case: measured across 50 real matched pairs the median separation was 0.0 km and 0.1
           * seconds, so the panel was calling almost every corroborated event a disagreement.
           */}
          <div className="label">Both agencies reported this</div>
          <div className="mt-2 border border-hairline bg-raised p-3">
            <div className="text-[12px] leading-relaxed text-ink">
              {spread.km < 1 && spread.seconds < 1 && spread.mag < 0.05
                ? "They agree to the precision they publish."
                : `They place it ${spread.km.toFixed(1)} km and ${spread.seconds.toFixed(1)} s apart`
                  + `${spread.mag < 0.05 ? ", on the same magnitude." : `, ${spread.mag.toFixed(1)} apart on magnitude.`}`}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-faint">
              Neither reading is discarded. The marker is drawn from {SOURCE_NAMES[r.source]}, so it
              does not move depending on which feed arrived first.
            </div>
          </div>
          {quake.readings.map((reading, i) => (
            <div key={i} className="mt-2 font-mono text-[11px] text-dim">
              <span className="text-ink">{SOURCE_NAMES[reading.source]}</span>{" "}
              M {reading.magnitude.toFixed(1)} {reading.scale} · {coordinates(reading)} ·{" "}
              {clock(reading.time)}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <span className="text-[11px] text-faint">Within {NEARBY_KM} km</span>
        {near.count === 0 ? (
          <p className="mt-2 text-[11.5px] text-faint">
            Nothing else in this window. On its own, so far.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[11.5px] leading-relaxed text-dim">
              {near.count} other event{near.count === 1 ? "" : "s"} in this window
              {near.largest !== null && near.largest > r.magnitude
                ? `, the largest M ${near.largest.toFixed(1)}`
                : ""}
              .
            </p>
            {near.notable.map(({ quake: other, km }) => (
              <div
                key={other.key}
                className="flex items-baseline gap-2 border-t border-hairline py-1.5"
              >
                <span className="w-[32px] shrink-0 font-mono text-[12px] text-ink">
                  {other.primary.magnitude.toFixed(1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">
                  {place(other.primary.place)}
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-faint">
                  {Math.round(km)} km
                </span>
              </div>
            ))}
            <Sequence nearby={near} magnitude={r.magnitude} ramp={ramp} />
          </>
        )}
      </div>

      <div className="mt-5 flex gap-2 pb-1">
        <button
          type="button"
          onClick={() => onFlyTo(r.lon, r.lat, 2.2)}
          className="cursor-pointer border border-hairline px-3 py-2 text-[11.5px] text-dim transition-colors hover:bg-raised hover:text-ink"
        >
          Fly here
        </button>
        {/*
          The permalink existed for a whole phase with no way to reach it: the URL updated silently
          and nothing on screen ever suggested it was worth copying. A feature nobody can find is
          not shipped.
        */}
        <button
          type="button"
          onClick={() => void copyLink()}
          className="cursor-pointer border border-hairline px-3 py-2 text-[11.5px] text-dim transition-colors hover:bg-raised hover:text-ink"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </aside>
  );
}
