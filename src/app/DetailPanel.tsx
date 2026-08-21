import { useMemo, useState } from "react";
import type { Filters, Quake } from "../data/types";
import type { RampName } from "../globe/ramp";
import type { Store } from "../data/store";
import { distanceKm } from "../geo/sphere";
import { depthClass, findNearby, NEARBY_KM } from "./nearby";
import { antipodeOf, FRONT_ARCS, frontLengthKm } from "../geo/antipode";
import { Sequence } from "./Sequence";
import { sectionThrough, type SectionLine } from "./section";
import { arrivalFor, seconds } from "./arrival";
import { daylight, solarClock, solarHour, sunElevation } from "../geo/sun";
import { P_WAVE_KM_PER_S, S_WAVE_KM_PER_S } from "../geo/waves";
import {
  ago, boundaryNote, clock, coordinates, depth, farSideNote, magnitude, place, SOURCE_NAMES,
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
  /** False while the panel is leaving. It stays mounted, holding its last event, to animate out. */
  open: boolean;
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
  /**
   * Opens a cross-section through this event, across the local trend.
   *
   * The section was reachable by shift-dragging the map and by nothing else, which is undiscoverable
   * on a mouse and impossible on a touch screen, where there is no shift to hold. The panel's own note
   * about the permalink says a feature nobody can find is not shipped; this was the same fault in the
   * one view that shows the dimension the map cannot.
   */
  onSection: (line: SectionLine) => void;
  /** Whether this event's far side is currently drawn, and the toggle for it. */
  farSide: boolean;
  onFarSide: (on: boolean) => void;
  /** Km to the nearest plate boundary, or null until the boundary file has loaded. */
  boundaryKm: number | null;
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
  open, quake, store, filters, ramp, excluded, revision, onClose, onFlyTo, onSection,
  farSide, onFarSide, boundaryKm,
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
  /*
   * Recomputed with the event rather than memoised: it is a regex and two divisions, where everything
   * else this panel derives walks the buffer.
   */
  const arrival = arrivalFor(quake);

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
    <aside
      data-open={open}
      // Out of the reading order the moment it starts leaving. `display: none` lands at the end of
      // the transition, so for those 300ms it is still a real panel describing an event nobody pinned.
      aria-hidden={!open}
      className="zone-panel flex w-[var(--panel-w)] flex-col overflow-y-auto border-l border-hairline bg-deck p-5 max-xl:w-full"
    >
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
        <p className="mt-3 border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
          Outside the current filters, so it is not on the globe. Everything below still describes it.
        </p>
      ) : null}

      {revisions.length > 0 ? (
        <div className="mt-2 border-l border-hairline pl-2.5">
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
        <div className="mt-2 border-l border-hairline pl-2.5 text-[11px] text-dim">
          recorded as a {r.kind}
        </div>
      ) : null}

      <div className="mt-4">
        <Field label="Depth" value={klass ? `${depth(r)} · ${klass}` : depth(r)} />
        <Field label="Position" value={coordinates(r)} />
        {/*
          Where it sits relative to the plate edges.

          With the coordinates rather than in prose, because it is the same kind of fact: a position,
          read against the geography the globe already draws. On its own it turns the place name into an
          explanation - "3,557 km from the nearest plate boundary" under Pahala, Hawaii is the hotspot,
          without the app ever having to claim one.
        */}
        {boundaryNote(boundaryKm) ? (
          <Field label="Boundary" value={boundaryNote(boundaryKm)!} />
        ) : null}
        {/*
          What the sky was doing there when it happened, which the terminator was already computing and
          nothing read. An M6 at three in the morning, with everyone asleep and indoors, is a different
          event from the same rupture at three in the afternoon.

          Solar time, not clock time, and that is the keyless answer rather than a lazy one: civil time
          needs timezone boundaries, which is a dataset, and this needs the sun, which is already here.
          Labelled "solar" so nobody reads it as what a watch there would have said.

          At the event's own origin, not at `now`. Computing it from the current clock would answer
          "what is the sky doing there at this moment", which is a fact about nothing.
        */}
        <Field
          label="Solar time"
          value={`${solarClock(solarHour(r.lon, r.time))} · ${daylight(sunElevation(r.lon, r.lat, r.time))}`}
        />
        <Field
          label="Reported by"
          value={quake.readings.map((x) => SOURCE_NAMES[x.source]).join(" + ")}
        />
      </div>

      {/*
        When it reached the nearest place with a name on it.

        A marker says an earthquake happened at a point. It does not say the point is 7km from a town
        that felt it two seconds later, and that is the fact that makes this something which happened
        to people rather than a dot in a margin.

        The distance and the town are the agency's own words, parsed out of "38 km NW of Stanton,
        Texas". Nothing is authored, which is the whole design: a list of cities with coordinates
        written from memory would make confident claims about real towns from latitudes that could be
        a tenth of a degree out, and a tenth of a degree is two seconds of an answer that reads as
        measured. Absent for an event whose agencies named only a region, because a region has no
        distance to give and a centroid would be that same invention.
      */}
      {arrival ? (
        <div className="mt-4">
          <p className="text-[11.5px] leading-relaxed text-dim">
            {arrival.place} is {arrival.km} km away. The first shake arrived about{" "}
            <span className="text-ink">{seconds(arrival.p)}</span> after the rupture, and the stronger
            S wave about {seconds(arrival.gap)} behind it.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Timed straight through the crust at {P_WAVE_KM_PER_S} and {S_WAVE_KM_PER_S} km/s, over the
            distance corrected for depth. Not a modelled travel time.
          </p>
        </div>
      ) : null}

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
          <div className="mt-2 border-l border-hairline pl-3">
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
          {/*
            One dot, and columns for the rest. Three facts joined by two middle dots reads as a string
            somebody concatenated; the same three aligned down the panel read as a comparison, which is
            what two agencies reporting one earthquake actually is.
          */}
          {quake.readings.map((reading, i) => (
            <div
              key={i}
              className="mt-2 flex items-baseline gap-x-3 font-mono text-[11px] text-dim"
            >
              <span className="w-[40px] shrink-0 text-ink">{SOURCE_NAMES[reading.source]}</span>
              <span className="w-[74px] shrink-0">
                M {reading.magnitude.toFixed(1)} {reading.scale}
              </span>
              <span className="min-w-0 flex-1 truncate">{coordinates(reading)}</span>
              <span className="shrink-0 text-faint">{clock(reading.time)}</span>
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
                className="flex items-baseline gap-2 py-1"
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

      {/*
        The one thing telling anybody the measurement exists.

        Measuring between two events reuses the pin and the hover rather than adding a mode, which is
        the right trade and leaves it with nothing to advertise: the hint strip is for keys and this is
        not a key. So the panel says it, while an event is pinned, which is exactly when it is true.
      */}
      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Hover another event to measure from this one.
      </p>

      {/*
        The figure's own sentence, present exactly while the figure is.
        In the panel rather than the legend because the legend describes what is always on the globe, and
        this is five arcs somebody asked for a moment ago about one specific epicentre.
      */}
      {farSide ? (
        <p className="mt-3 border-l border-hairline pl-2.5 text-[11px] leading-relaxed text-dim">
          {farSideNote(FRONT_ARCS, frontLengthKm, antipodeOf(r.lon, r.lat))}
        </p>
      ) : null}

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
        {/*
          Offered whichever view is showing, because taking it switches to the map.
          A section only exists on the map, so this is not the button deciding the projection: it is
          naming a slice that has nowhere else to be drawn, which is the same reasoning a shared link
          carrying a section already follows.
        */}
        <button
          type="button"
          onClick={() => onSection(sectionThrough(r.lon, r.lat, near.trendDeg))}
          className="cursor-pointer border border-hairline px-3 py-2 text-[11.5px] text-dim transition-colors hover:bg-raised hover:text-ink"
        >
          Slice here
        </button>
        {/*
          The far side, offered rather than drawn.

          Five circles spanning the planet is not something to hand somebody who clicked an event to
          read its depth, which is why this is a button and not a consequence of selection. It is a
          figure about the shape of the Earth and it claims no timing: the live rings fade at 17
          degrees, 9.4% of the way, and the far side is 55 minutes of real travel that this app has
          always refused to model. See `geo/antipode.ts`.
        */}
        <button
          type="button"
          aria-pressed={farSide}
          onClick={() => onFarSide(!farSide)}
          className={`cursor-pointer border px-3 py-2 text-[11.5px] transition-colors ${
            farSide
              ? "border-faint bg-raised text-ink"
              : "border-hairline text-dim hover:bg-raised hover:text-ink"
          }`}
        >
          Far side
        </button>
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
