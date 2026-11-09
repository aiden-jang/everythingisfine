import { lazy, Suspense } from "react";
import type { StoryId, useObservationDeck } from "./useObservationDeck";
import type { SkyCityPreference } from "../tonight/SkyCityPicker";
import type { EarthScene } from "../useObservatory";
import { ObservationCredit } from "./ObservationCredit";
import "./observations.css";
import "../lights/lights.css";
import "../shadow/shadow.css";

const ObservationDeck = lazy(() =>
  import("./ObservationDeck").then(({ ObservationDeck }) => ({ default: ObservationDeck })),
);

const LightsReturn = lazy(() =>
  import("../lights/LightsReturn").then(({ LightsReturn }) => ({ default: LightsReturn })),
);

const ShadowChase = lazy(() =>
  import("../shadow/ShadowChase").then(({ ShadowChase }) => ({ default: ShadowChase })),
);

const KilaueaJourney = lazy(() =>
  import("../kilauea/KilaueaJourney").then(({ KilaueaJourney }) => ({ default: KilaueaJourney })),
);

export function ObservationDeckShell({
  deck,
  entry,
  scene,
  city,
  onClose,
}: {
  deck: ReturnType<typeof useObservationDeck>;
  entry: StoryId;
  scene: EarthScene;
  city: SkyCityPreference;
  onClose: () => void;
}): JSX.Element {
  const close = () => {
    onClose();
    requestAnimationFrame(() =>
      document
        .getElementById(deck.trigger ?? "open-observations")
        ?.focus({ preventScroll: !deck.trigger?.startsWith("archive-story-") }),
    );
  };
  const closeLabel = deck.trigger?.startsWith("archive-story-")
    ? "Back to archive"
    : scene === "night"
      ? "Back to After Dark"
      : scene === "depth"
        ? "Back to Below the Surface"
        : "Back to Observatory";
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
      {entry === "lights" ? (
        <LightsReturn onView={deck.update} onClose={close} />
      ) : entry === "shadow" ? (
        <ShadowChase city={city.city} onView={deck.update} onMap={deck.setMap} onClose={close} />
      ) : entry === "kilauea" ? (
        <KilaueaJourney onView={deck.update} onMap={deck.setMap} onClose={close} closeLabel={closeLabel} />
      ) : (
        <ObservationDeck deck={{ ...deck, entry }} closeLabel={closeLabel} city={city} onClose={close} />
      )}
    </Suspense>
  );
}
