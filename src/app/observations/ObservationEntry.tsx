import { lazy, Suspense } from "react";
import type { ObservationId } from "./catalogue";
import type { useObservationDeck } from "./useObservationDeck";
import { ObservationCredit } from "./ObservationCredit";
import "./observations.css";

const ObservationDeck = lazy(() =>
  import("./ObservationDeck").then(({ ObservationDeck }) => ({ default: ObservationDeck })),
);

export function ObservationDeckShell({
  deck,
  entry,
  night,
}: {
  deck: ReturnType<typeof useObservationDeck>;
  entry: ObservationId | "catalogue";
  night: boolean;
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
        onClose={() => {
          deck.close();
          requestAnimationFrame(() =>
            document.getElementById(night ? "open-orbital-pass" : "open-observations")?.focus(),
          );
        }}
      />
    </Suspense>
  );
}

export function LiveExperiences({
  ready,
  radar,
  dive,
  more,
}: {
  ready: boolean;
  radar: () => void;
  dive: () => void;
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
      <button type="button" id="open-observations" onClick={() => more()} disabled={!ready}>
        More views
      </button>
    </>
  );
}
