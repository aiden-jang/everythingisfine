import { lazy, Suspense } from "react";
import type { ObservationId } from "./catalogue";
import type { useObservationDeck } from "./useObservationDeck";
import type { EarthScene } from "../useObservatory";
import { ObservationCredit } from "./ObservationCredit";
import "./observations.css";

const ObservationDeck = lazy(() =>
  import("./ObservationDeck").then(({ ObservationDeck }) => ({ default: ObservationDeck })),
);

export function ObservationDeckShell({
  deck,
  entry,
  scene,
  city,
}: {
  deck: ReturnType<typeof useObservationDeck>;
  entry: ObservationId | "catalogue";
  scene: EarthScene;
  city: { name: string; select: (name: string) => void };
}): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="observatory-sidebar">
          <p className="observatory-intro" role="status">
            Opening observatory views…
          </p>
          <ObservationCredit />
        </div>
      }
    >
      <ObservationDeck
        deck={{ ...deck, entry }}
        closeLabel={
          scene === "night"
            ? "Back to After Dark"
            : scene === "depth"
              ? "Back to Below the Surface"
              : "Back to Observatory"
        }
        city={city}
        onClose={() => {
          deck.close();
          requestAnimationFrame(() => document.getElementById(deck.trigger ?? "open-observations")?.focus());
        }}
      />
    </Suspense>
  );
}

export function LiveExperiences({
  ready,
  radar,
  dive,
  epic,
  more,
}: {
  ready: boolean;
  radar: () => void;
  dive: () => void;
  epic: () => void;
  more: () => void;
}): JSX.Element {
  return (
    <>
      <button type="button" id="open-storm-radar" onClick={radar} disabled={!ready}>
        Storm Radar
      </button>
      <button type="button" id="open-float-dive" onClick={dive} disabled={!ready}>
        Float Dive
      </button>
      <button type="button" id="open-epic" onClick={epic} disabled={!ready}>
        Million-Mile View
      </button>
      <button type="button" id="open-observations" onClick={() => more()} disabled={!ready}>
        More views
      </button>
    </>
  );
}
