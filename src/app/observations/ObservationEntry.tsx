import { StoryLoading } from "../StoryLoading";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { lazy, Suspense } from "react";
import type { StoryId, useObservationDeck } from "./useObservationDeck";
import type { SkyCityPreference } from "../tonight/SkyCityPicker";
import type { EarthScene } from "../useObservatory";
import { RecordedReplay } from "./RecordedReplay";
import { isReplay } from "./replays";
import { ObservationCredit } from "./ObservationCredit";
import { StorySession } from "./StorySession";
import { observations } from "./catalogue";
import { earthStories } from "../earth-stories/catalogue";
import { isEarthStory } from "../earth-stories/catalogue";
import "../earth-stories/stories.css";
import "./observations.css";
import "../lights/lights.css";
import "../shadow/shadow.css";

const ObservationDeck = lazy(() =>
  import("./ObservationDeck").then(({ ObservationDeck }) => ({ default: ObservationDeck })),
);
const EarthStory = lazy(() =>
  import("../earth-stories/EarthStory").then(({ EarthStory }) => ({ default: EarthStory })),
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
  onRadar,
}: {
  deck: ReturnType<typeof useObservationDeck>;
  entry: StoryId;
  scene: EarthScene;
  city: SkyCityPreference;
  onClose: () => void;
  onRadar: () => void;
}): JSX.Element {
  const navigation = useStoryNavigation();
  const fromExplore = deck.trigger?.startsWith("archive-story-") || deck.trigger?.startsWith("event-story-");
  const close = () => {
    if (navigation?.returnToBrowse()) return;
    onClose();
    requestAnimationFrame(() =>
      document.getElementById(deck.trigger ?? "observatory-scenes")?.focus({ preventScroll: !fromExplore }),
    );
  };
  const closeLabel =
    navigation?.returnLabel ??
    (deck.trigger?.startsWith("event-story-")
      ? "Back to earthquake"
      : deck.trigger?.startsWith("archive-story-")
        ? "Back to archive"
        : scene === "night"
          ? "Back to After Dark"
          : scene === "depth"
            ? "Back to Below the Surface"
            : "Back to Observatory");
  return (
    <StorySession.Provider key={entry} value={deck.session}>
      <Suspense
        fallback={
          <div className="observatory-sidebar">
            <section className="observatory-intro" aria-label="Opening story">
              <StoryLoading>
                Opening{" "}
                {isEarthStory(entry)
                  ? earthStories[entry].title
                  : entry in observations
                    ? observations[entry as keyof typeof observations].title
                    : "story"}
                …
              </StoryLoading>
              <div className="observatory-actions">
                <button type="button" onClick={close}>
                  {closeLabel}
                </button>
              </div>
            </section>
            <ObservationCredit />
          </div>
        }
      >
        {isEarthStory(entry) ? (
          <EarthStory
            id={entry}
            map={deck.map}
            onMap={deck.setMap}
            onView={deck.update}
            onClose={close}
            closeLabel={closeLabel}
            city={city}
            onRadar={onRadar}
          />
        ) : entry === "lights" ? (
          <LightsReturn onView={deck.update} onClose={close} closeLabel={closeLabel} />
        ) : entry === "shadow" ? (
          <ShadowChase
            city={city.city}
            onView={deck.update}
            onMap={deck.setMap}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : entry === "kilauea" ? (
          <KilaueaJourney onView={deck.update} onMap={deck.setMap} onClose={close} closeLabel={closeLabel} />
        ) : isReplay(entry) ? (
          <RecordedReplay
            entry={entry}
            map={deck.map}
            onMap={deck.setMap}
            onView={deck.update}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : (
          <ObservationDeck deck={{ ...deck, entry }} closeLabel={closeLabel} city={city} onClose={close} />
        )}
      </Suspense>
    </StorySession.Provider>
  );
}
