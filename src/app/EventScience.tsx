import type { Quake } from "../data/types";
import { P_WAVE_KM_PER_S, S_WAVE_KM_PER_S } from "../geo/waves";
import { arrivalFor, seconds } from "./arrival";
import { replays } from "./observations/replays";
import type { StartInspection } from "./useEventInspection";
import { WaveChooser } from "./WaveChooser";

const TOHOKU_IDS = new Set(["official20110311054624120_30", "usc0001xgp", "usp000hvnu"]);

export function EventScience({
  quake,
  onInspect,
  onRupture,
}: {
  quake: Quake;
  onInspect: StartInspection | null;
  onRupture: () => void;
}): JSX.Element {
  const arrival = arrivalFor(quake);
  const tohoku = quake.readings.some(({ source, id }) => source === "usgs" && TOHOKU_IDS.has(id));
  return (
    <>
      {tohoku && (
        <button
          type="button"
          id="event-story-rupture"
          className="archive-scene-button mt-4 w-full text-left"
          onClick={onRupture}
        >
          {replays.rupture.label}
        </button>
      )}
      {arrival ? (
        <div className="mt-4">
          <p className="text-[11px] leading-relaxed text-dim">
            {arrival.place} is {arrival.km} km away. The first shake arrived about{" "}
            <span className="text-ink">{seconds(arrival.p)}</span> after the rupture, and the stronger S wave
            about {seconds(arrival.gap)} behind it.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Timed straight through the crust at {P_WAVE_KM_PER_S} and {S_WAVE_KM_PER_S} km/s, over the
            distance corrected for depth. Not a modelled travel time.
          </p>
        </div>
      ) : null}

      {onInspect && <WaveChooser key={quake.key} quake={quake} onFollow={onInspect} />}
    </>
  );
}
