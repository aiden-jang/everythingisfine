import type { Dispatch, RefObject, SetStateAction } from "react";
import type { RampName } from "../globe/ramp";

export function EarthquakeOptions({
  ramp,
  setRamp,
  sound,
  setSound,
  tourAt,
  startTour,
  stopTour,
  tourButton,
  tourDisabled,
}: {
  ramp: RampName;
  setRamp: Dispatch<SetStateAction<RampName>>;
  sound: boolean;
  setSound: Dispatch<SetStateAction<boolean>>;
  tourAt: number | null;
  startTour: () => void;
  stopTour: () => void;
  tourButton: RefObject<HTMLButtonElement>;
  tourDisabled: boolean;
}) {
  return (
    <details className="layer-sources earthquake-options">
      <summary>Display, alerts & tour</summary>
      <button
        type="button"
        aria-pressed={ramp === "cividis"}
        onClick={() => setRamp((value) => (value === "thermal" ? "cividis" : "thermal"))}
      >
        Magnitude colors · {ramp === "cividis" ? "Cividis" : "Thermal"}
      </button>
      <button type="button" aria-pressed={sound} onClick={() => setSound((value) => !value)}>
        Earthquake alerts {sound ? "on" : "off"}
      </button>
      <p>Sound for newly reported earthquakes above your selected threshold.</p>
      <button
        ref={tourButton}
        type="button"
        disabled={tourDisabled}
        aria-pressed={tourAt !== null}
        onClick={() => (tourAt === null ? startTour() : stopTour())}
      >
        {tourAt !== null ? "Stop tour" : "Earthquake tour"}
      </button>
    </details>
  );
}
