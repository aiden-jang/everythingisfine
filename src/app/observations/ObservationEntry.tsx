import { StoryLoading } from "../StoryLoading";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { lazy, Suspense } from "react";
import type { StoryId, useObservationDeck } from "./useObservationDeck";
import type { SkyCityPreference } from "../tonight/SkyCityPicker";
import type { EarthScene } from "../useObservatory";
import { RecordedReplay, type ReplayProps } from "./RecordedReplay";
import { isReplay } from "./replays";
import { StorySession } from "./StorySession";
import { searchStories } from "../storyIndex";
import { isEarthStory } from "../earth-stories/catalogue";
import "../earth-stories/stories.css";
import "../earth-stories/celestial.css";
import "./orbital-pass.css";
import "./observations.css";
import "../iceberg/iceberg.css";
import "../lights/lights.css";
import "../shadow/shadow.css";

const ObservationDeck = lazy(() =>
  import("./ObservationDeck").then(({ ObservationDeck }) => ({ default: ObservationDeck })),
);
const OrbitalPass = lazy(() => import("./OrbitalPass").then(({ OrbitalPass }) => ({ default: OrbitalPass })));
const EarthStory = lazy(() =>
  import("../earth-stories/EarthStory").then(({ EarthStory }) => ({ default: EarthStory })),
);

const IcebergDrift = lazy(() =>
  import("../iceberg/IcebergDrift").then(({ IcebergDrift }) => ({ default: IcebergDrift })),
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
  readCamera,
  restoreCamera,
  onClose,
  onRadar,
}: {
  deck: ReturnType<typeof useObservationDeck>;
  entry: StoryId;
  scene: EarthScene;
  city: SkyCityPreference;
  readCamera: NonNullable<ReplayProps["readCamera"]>;
  restoreCamera: NonNullable<ReplayProps["restoreCamera"]>;
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
    <StorySession.Provider key={`${entry}:${deck.revision}`} value={deck.session}>
      <Suspense
        fallback={
          <div className="observatory-sidebar replay-sidebar">
            <section className="observatory-intro" aria-label="Opening story">
              <StoryLoading>
                Opening {searchStories.find(({ id }) => id === entry)?.title ?? "story"}…
              </StoryLoading>
              <div className="observatory-actions">
                <button type="button" onClick={close}>
                  {closeLabel}
                </button>
              </div>
            </section>
          </div>
        }
      >
        {isEarthStory(entry) ? (
          <EarthStory
            id={entry}
            readCamera={readCamera}
            restoreCamera={restoreCamera}
            map={deck.map}
            onMap={deck.setMap}
            onView={deck.update}
            onClose={close}
            closeLabel={closeLabel}
            city={city}
            onRadar={onRadar}
          />
        ) : entry === "orbit" ? (
          <OrbitalPass
            city={city}
            map={deck.map}
            readCamera={readCamera}
            restoreCamera={restoreCamera}
            onMap={deck.setMap}
            onView={deck.update}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : entry === "iceberg" ? (
          <IcebergDrift
            map={deck.map}
            readCamera={readCamera}
            restoreCamera={restoreCamera}
            onMap={deck.setMap}
            onView={deck.update}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : entry === "lights" ? (
          <LightsReturn
            map={deck.map}
            onMap={deck.setMap}
            onView={deck.update}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : entry === "shadow" ? (
          <ShadowChase
            city={city.city}
            onView={deck.update}
            onMap={deck.setMap}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : entry === "kilauea" ? (
          <KilaueaJourney
            map={deck.map}
            onView={deck.update}
            onMap={deck.setMap}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : isReplay(entry) ? (
          <RecordedReplay
            entry={entry}
            readCamera={readCamera}
            restoreCamera={restoreCamera}
            map={deck.map}
            onMap={deck.setMap}
            onView={deck.update}
            onClose={close}
            closeLabel={closeLabel}
          />
        ) : (
          <ObservationDeck deck={{ ...deck, entry }} closeLabel={closeLabel} onClose={close} />
        )}
      </Suspense>
    </StorySession.Provider>
  );
}
