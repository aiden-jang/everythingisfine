import { observatoryIntroduction } from "./observatoryIntroduction";
import { SunWatch, TonightSky, TonightCompass, FloatDive } from "./ObservatoryViews";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import type { CameraState } from "../globe/controls";
import { ExperienceEnding } from "./journeys/ExperienceEnding";
import { Suspense, type RefObject, type ReactNode } from "react";
import { useObservatoryScroll } from "./useObservatoryScroll";
import { ObservatoryStage, ObservatoryScenePicker, SunCredits, TourUnavailable } from "./ObservatoryStage";
import { ObservatoryTourControls } from "./ObservatoryTourControls";
import { Discoveries, type DiscoveriesData } from "./visitor/Discoveries";
import { StoriesDrawer } from "./StoriesDrawer";
import { MoonfallReadout } from "./moonfall/MoonfallReadout";
import { FloatReadout } from "./float/FloatReadout";
import { RadarReadout, StormRadar } from "./radar/StormRadar";
import { AuroraOverflightControls } from "./AuroraOverflightControls";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { EarthScene, useObservatory } from "./useObservatory";
import type { Stop } from "./tour";
import { geographicCoordinates } from "../globe/orbitReadout";
import "./experience.css";
import "./sun/sun-watch.css";
import "./tonight/tonight.css";
import "./float/float-dive.css";
import "./float/float-profile.css";
import "./float/float-journey.css";
import "./measurement-sound.css";
import "./moonfall/moonfall.css";
import { ObservationDeckShell } from "./observations/ObservationEntry";
import { ObservatoryEntryActions } from "./ObservatoryEntryActions";
import { LandingStory } from "./LandingStory";
import { StoryBoundary } from "./StoryBoundary";

export interface ObservatoryProps {
  explorer: {
    radarAt: number | undefined;
    flat: boolean;
    read: () => CameraState;
    restore: (camera: CameraState, flat?: boolean) => void;
    radarTime: (at: number | null) => void;
  };
  discoveries: DiscoveriesData;
  scene: EarthScene;
  at: number;
  ready: boolean;
  empty: ReturnType<typeof import("./earthquakeStatus").earthquakeEmpty>;
  summary: string;
  feedNote: string | null;
  deepAvailable: boolean;
  aurora: ReturnType<typeof useAuroraOverflight>;
  views: Pick<
    ReturnType<typeof useObservatory>,
    | "observing"
    | "landing"
    | "sun"
    | "tonight"
    | "floatDive"
    | "observations"
    | "skyCity"
    | "openAfterDarkArchive"
    | "closeStory"
    | "browser"
    | "visitCheckpoint"
    | "navigation"
  >;
  radar: ReturnType<typeof useObservatory>["radar"];
  layerReadout: ReactNode;
  onScene: (scene: EarthScene) => void;
  onHome: () => void;
  onExplore: () => void;
  onPickDate: () => void;
  tour: {
    at: number | null;
    stop: Stop | null;
    length: number;
    paused: boolean;
    button: RefObject<HTMLButtonElement>;
    controls: RefObject<HTMLElement>;
    start: () => void;
    stopTour: () => void;
    next: () => void;
    previous: () => void;
    pause: () => void;
    available: boolean;
    inspect: (() => void) | null;
  };
  onHistory: (day: string) => void;
}

export function Observatory(props: ObservatoryProps): JSX.Element {
  const navigation = useStoryNavigation();
  return (
    <StoryBoundary
      resetKey={props.views.navigation.key}
      closeLabel={navigation?.returnLabel ?? "Back to home"}
      onClose={() => {
        if (!navigation?.returnToBrowse()) props.onHome();
      }}
    >
      <ObservatoryContent {...props} />
    </StoryBoundary>
  );
}

function ObservatoryContent({
  layerReadout,
  discoveries,
  scene,
  at,
  ready,
  empty,
  summary,
  deepAvailable,
  aurora,
  views: { sun, tonight, floatDive, observations, skyCity, closeStory, browser, navigation, landing },
  radar,
  feedNote,
  onScene,
  onHome,
  onExplore,
  onPickDate,
  tour,
  onHistory,
}: ObservatoryProps): JSX.Element {
  const navigationContext = useStoryNavigation();
  const closeView = (fallback: () => void) => () => {
    if (!navigationContext?.returnToBrowse()) fallback();
  };
  const { open: stories, scroll: storyScroll } = browser;
  const active = tour.at !== null;
  const solar = sun.active && !active;
  const browsing =
    stories && !active && !solar && !aurora.run && !tonight.active && !floatDive.active && !radar.active;
  const revealStories = useObservatoryScroll(
    tour.controls,
    storyScroll,
    browsing,
    [navigation.key, tour.at, browser.home].join(":"),
  );
  const closeSun = closeView(() => observations.returnTo("open-sun-watch", sun.toggle));
  const auroraControls = (
    <AuroraOverflightControls
      aurora={aurora}
      ready={ready}
      solar={solar}
      returnLabel={navigationContext?.returnLabel}
      onReturn={closeView(() => observations.returnTo("open-aurora-overflight", () => onScene("night")))}
      onSunWatch={sun.toggle}
      onTonight={() => tonight.open()}
      city={skyCity}
    />
  );
  const { title, description } = observatoryIntroduction({
    active,
    stop: tour.stop,
    scene,
    solar,
    aurora: !!aurora.run,
    deepAvailable,
    landing,
  });
  if (observations.entry)
    return (
      <ObservationDeckShell
        deck={observations}
        entry={observations.entry}
        scene={scene}
        city={skyCity}
        onClose={closeStory}
        onRadar={() => radar.open("pacific", true)}
      />
    );
  return (
    <>
      {floatDive.active ? (
        <FloatReadout view={floatDive.view} projection={observations} />
      ) : radar.active ? (
        <RadarReadout map={observations.map} region={radar.view?.region} />
      ) : tonight.view?.moonfall ? (
        <MoonfallReadout view={tonight.view.moonfall} />
      ) : tonight.active ? (
        <Suspense fallback={null}>
          <TonightCompass view={tonight.view} onView={tonight.update} />
        </Suspense>
      ) : (
        !solar && (
          <ObservatoryStage
            scene={scene}
            at={at}
            tour={active ? tour.stop : undefined}
            aurora={aurora.run}
            layers={layerReadout}
          />
        )
      )}
      <div className="observatory-sidebar">
        <section
          id="observatory-intro"
          tabIndex={-1}
          className="observatory-intro"
          ref={tour.controls}
          onScroll={(event) => {
            if (browsing) storyScroll.current = event.currentTarget.scrollTop;
          }}
          data-scene={active ? "tour" : scene}
          data-browsing={browsing || undefined}
          data-sun-watch={solar || undefined}
          data-storm-radar={radar.active || undefined}
          data-tonight={tonight.active || undefined}
          data-float-dive={floatDive.active || undefined}
          aria-label={floatDive.active ? "Float Dive" : radar.active ? "Storm Radar" : "Earth observatory"}
          aria-labelledby={tonight.active ? "local-sky-title" : undefined}
        >
          {floatDive.active ? (
            <Suspense fallback={<p role="status">Opening Float Dive…</p>}>
              <FloatDive
                view={floatDive.view}
                resume={floatDive.entry}
                returnLabel={navigationContext?.returnLabel}
                onView={floatDive.update}
                projection={observations}
                onClose={closeView(() => observations.returnTo("open-featured-float", floatDive.close))}
              />
            </Suspense>
          ) : radar.active ? (
            <StormRadar
              projection={observations}
              fromExplore={radar.fromExplore}
              returnLabel={navigationContext?.returnLabel}
              entry={radar.entry}
              onView={radar.update}
              onClose={closeView(() => {
                const trigger = radar.fromExplore ? "open-explorer-radar" : "open-storm-radar";
                observations.returnTo(trigger, radar.close);
              })}
            />
          ) : tonight.active ? (
            <Suspense fallback={<p role="status">Opening Tonight’s Sky…</p>}>
              <TonightSky
                key={tonight.entry.revision}
                view={tonight.view}
                onView={tonight.update}
                preference={skyCity}
                initialMode={tonight.entry.mode}
                initialLunar={tonight.entry.lunar}
                initialLook={tonight.entry.look}
                initialMoment={tonight.entry.moment}
                returnLabel={navigationContext?.returnLabel ?? "Back to After Dark"}
                onClose={closeView(() => {
                  const id =
                    tonight.entry.mode === "meteors"
                      ? "open-meteor-nights"
                      : tonight.entry.mode === "moonfall"
                        ? "open-featured-moonfall"
                        : "open-tonight-sky";
                  observations.returnTo(id, tonight.close);
                })}
              />
            </Suspense>
          ) : (
            <>
              <div className="observatory-story" aria-live="polite" aria-atomic="true">
                <h2 key={title}>
                  {landing ? (
                    <>
                      Look
                      <br />
                      closer.
                    </>
                  ) : (
                    title
                  )}
                </h2>
                <p key={description} className="observatory-description">
                  {description}
                </p>
                {active && tour.stop ? (
                  <p
                    className="observatory-location"
                    data-tour-location={`${tour.stop.lon},${tour.stop.lat}`}
                  >
                    {tour.stop.name}{" "}
                    <span>
                      {geographicCoordinates(tour.stop)} · Stop {Math.min((tour.at ?? 0) + 1, tour.length)} of{" "}
                      {tour.length}
                    </span>
                  </p>
                ) : null}
              </div>
              {solar && <SunCredits />}
              {active ? (
                <ObservatoryTourControls tour={tour} onExplore={onExplore} />
              ) : (
                <>
                  <ObservatoryEntryActions
                    landing={landing}
                    solar={solar}
                    explore={onExplore}
                    closeSun={closeSun}
                  />
                  {scene !== "night" && !landing ? (
                    <p
                      id={ready && !tour.available ? "tour-availability" : undefined}
                      className="observatory-summary"
                    >
                      {summary}
                    </p>
                  ) : null}
                </>
              )}
              {!active && !solar && !aurora.run && (
                <ObservatoryScenePicker
                  scene={browser.category}
                  ready={ready}
                  deepAvailable={deepAvailable}
                  onScene={(next) => {
                    observations.setQuery("");
                    if (browser.category === next) {
                      browser.select(null);
                      return;
                    }
                    revealStories();
                    browser.select(next);
                    onScene(next);
                  }}
                />
              )}
              {!browsing && !active && !solar && !aurora.run && scene === "live" && <LandingStory />}
              {browsing && scene === "depth" && ready && !deepAvailable && (
                <p id="depth-availability" className="observatory-depth-note">
                  No earthquake at least 70 km deep in this window. Recorded depth stories are still
                  available.
                </p>
              )}
              {browsing && (
                <StoriesDrawer
                  browse={browser}
                  scene={browser.category}
                  ready={ready}
                  observations={observations}
                  aurora={aurora}
                  onHistory={onHistory}
                  onPickDate={onPickDate}
                  discoveries={<Discoveries data={discoveries} aurora={aurora} city={skyCity.city} />}
                  onSelect={() => {
                    storyScroll.current = tour.controls.current?.scrollTop ?? 0;
                  }}
                  onDismiss={() => {
                    onHome();
                    document.getElementById("observatory-scenes")?.focus();
                  }}
                >
                  <div className="observatory-actions">
                    <button
                      type="button"
                      ref={tour.button}
                      onClick={tour.start}
                      disabled={!ready || !tour.available}
                      aria-describedby={ready && !tour.available ? "tour-availability" : undefined}
                    >
                      Take a tour <span aria-hidden="true">→</span>
                    </button>
                    {ready && !tour.available && scene === "night" && <TourUnavailable note={empty.text} />}
                  </div>
                </StoriesDrawer>
              )}
              {(solar || aurora.run) && auroraControls}
              {feedNote && !landing ? (
                <p className="observatory-source-note" role="status">
                  {feedNote}
                </p>
              ) : null}
            </>
          )}
          {(floatDive.active || radar.active || solar || aurora.run) && <ExperienceEnding />}
        </section>
      </div>
      {solar && (
        <Suspense
          fallback={
            <div className="observatory-stage sun-watch-loading" role="status">
              Opening Sun Watch…
            </div>
          }
        >
          <SunWatch onClose={closeSun} />
        </Suspense>
      )}
    </>
  );
}
