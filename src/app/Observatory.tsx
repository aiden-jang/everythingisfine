import { observatoryIntroduction, observatoryReadingLabel } from "./observatoryIntroduction";
import { SunWatch, SunLoading, TonightSky, TonightCompass, FloatDive } from "./ObservatoryViews";
import { useOvalReturn } from "./sun/useSunVisit";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import type { CameraState } from "../globe/controls";
import { ExperienceEnding } from "./journeys/ExperienceEnding";
import { Suspense, useLayoutEffect, type RefObject, type ReactNode } from "react";
import { ObservatoryStage, ObservatoryScenePicker, SunCredits } from "./ObservatoryStage";
import { ObservatoryTourControls } from "./ObservatoryTourControls";
import type { DiscoveriesData } from "./visitor/Discoveries";
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
import { StoryBoundary } from "./StoryBoundary";
import { StoryLoading } from "./StoryLoading";
import { StoryDockProvider } from "./observations/StoryDock";
import { nightfallPosition } from "./tonight/nightfall";
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
  summary: string;
  feedNote: string | null;
  deepAvailable: boolean;
  aurora: ReturnType<typeof useAuroraOverflight>;
  views: Pick<
    ReturnType<typeof useObservatory>,
    | "observing"
    | "observeScene"
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
  onExplore: (showPanel?: boolean) => void;
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
  return (
    <StoryBoundary resetKey={props.views.navigation.key} onHome={props.onHome}>
      <ObservatoryContent {...props} />
    </StoryBoundary>
  );
}
function ObservatoryContent({
  layerReadout,
  explorer,
  scene,
  at,
  ready,
  summary,
  deepAvailable,
  aurora,
  views: { sun, tonight, floatDive, observations, skyCity, closeStory, browser, landing, navigation },
  radar,
  feedNote,
  onScene,
  onHome,
  onExplore,
  tour,
}: ObservatoryProps): JSX.Element {
  const navigationContext = useStoryNavigation();
  const closeView = (fallback: () => void) => () => {
    if (!navigationContext?.returnToBrowse()) fallback();
  };
  const active = tour.at !== null;
  const solar = sun.active && !active;
  useLayoutEffect(() => {
    tour.controls.current?.scrollTo(0, 0);
    tour.controls.current?.querySelector(".observatory-story")?.scrollTo(0, 0);
  }, [navigation.key, tour.at, tour.controls]);
  const ovalReturn = useOvalReturn(tour.controls, sun);
  const closeSun = aurora.run
    ? ovalReturn.close
    : closeView(() => observations.returnTo("open-sun-watch", sun.close));
  const closeAurora = closeView(() =>
    observations.returnTo("open-aurora-overflight", () => onScene("night")),
  );
  const auroraControls = (
    <AuroraOverflightControls
      aurora={aurora}
      ready={ready}
      solar={solar}
      onSunWatch={ovalReturn.open}
      onCloseSun={sun.close}
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
        readCamera={explorer.read}
        restoreCamera={explorer.restore}
        onClose={closeStory}
        onRadar={() => radar.open("pacific", true)}
      />
    );
  return (
    <section
      className="replay-region"
      aria-labelledby={tonight.active ? "local-sky-title" : undefined}
      aria-label={radar.active ? "Storm Radar" : undefined}
    >
      {floatDive.active ? (
        <FloatReadout view={floatDive.view} projection={observations} />
      ) : radar.active ? (
        <RadarReadout map={observations.map} onMap={observations.setMap} region={radar.view?.region} />
      ) : tonight.view?.moonfall ? (
        <MoonfallReadout
          view={tonight.view.moonfall}
          wake={() => {
            if (tonight.view) tonight.update({ ...tonight.view });
          }}
        />
      ) : tonight.active ? (
        <Suspense fallback={null}>
          <TonightCompass
            view={tonight.view}
            onView={tonight.update}
            projection={observations}
            orbit={tonight.orbit}
            onOrbit={tonight.setOrbit}
          />
        </Suspense>
      ) : (
        !solar && (
          <ObservatoryStage
            scene={scene}
            at={at}
            tour={active ? tour.stop : undefined}
            aurora={aurora.run}
            layers={layerReadout}
            projection={observations}
            onNightfall={
              landing && ready && navigationContext
                ? (anchor) =>
                    navigationContext.openNightfall(
                      nightfallPosition(at, anchor ?? explorer.read()),
                      "follow-nightfall",
                    )
                : undefined
            }
          />
        )
      )}
      <div className={`observatory-sidebar${tonight.active || radar.active ? " replay-sidebar" : ""}`}>
        <StoryDockProvider>
          <section
            id="observatory-intro"
            tabIndex={-1}
            className="observatory-intro"
            ref={tour.controls}
            data-scene={active ? "tour" : scene}
            data-sun-watch={solar || undefined}
            data-storm-radar={radar.active || undefined}
            data-tonight={tonight.active || undefined}
            data-float-dive={floatDive.active || undefined}
            aria-label={observatoryReadingLabel(floatDive.active, tonight.active || radar.active)}
            aria-labelledby={tonight.active ? "local-sky-title" : undefined}
            role={tonight.active || radar.active ? "group" : undefined}
          >
            {floatDive.active ? (
              <Suspense fallback={<StoryLoading>Opening Float Dive…</StoryLoading>}>
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
                fromExplore={radar.fromExplore}
                returnLabel={radar.entry.story ? undefined : navigationContext?.returnLabel}
                entry={radar.entry}
                onView={radar.update}
                onClose={
                  radar.entry.story
                    ? radar.close
                    : closeView(() => {
                        const trigger = radar.fromExplore ? "open-explorer-radar" : "open-storm-radar";
                        observations.returnTo(trigger, radar.close);
                      })
                }
              />
            ) : tonight.active ? (
              <Suspense fallback={<StoryLoading>Opening Tonight’s Sky…</StoryLoading>}>
                <TonightSky
                  key={tonight.entry.revision}
                  view={tonight.view}
                  onView={tonight.update}
                  onJourney={tonight.handoff}
                  onLocalSky={() => {
                    tonight.setOrbit(false);
                    observations.setMap(false);
                  }}
                  readCamera={explorer.read}
                  preference={skyCity}
                  projection={observations}
                  initialMode={tonight.entry.mode}
                  initialPosition={tonight.entry.position}
                  nightfall={tonight.entry.nightfall}
                  orbit={tonight.orbit}
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
                {(solar || aurora.run) && (
                  <button
                    type="button"
                    className="after-dark-return"
                    onClick={solar ? closeSun : closeAurora}
                  >
                    {solar && aurora.run
                      ? "Back to the oval"
                      : (navigationContext?.returnLabel ?? "Back to stars")}
                  </button>
                )}
                <div className="observatory-story" aria-live="polite" aria-atomic="true">
                  <h2 key={title}>
                    {landing ? (
                      <>
                        Look
                        <br /> closer.
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
                        {geographicCoordinates(tour.stop)} · Stop {Math.min((tour.at ?? 0) + 1, tour.length)}{" "}
                        of {tour.length}
                      </span>
                    </p>
                  ) : null}
                </div>
                {solar && <SunCredits />}
                {active ? (
                  <ObservatoryTourControls tour={tour} onExplore={onExplore} />
                ) : (
                  <>
                    {!solar && !aurora.run && (
                      <ObservatoryEntryActions
                        explore={() => {
                          browser.show("layers");
                          onExplore();
                        }}
                        browse={() => navigationContext?.browse(true)}
                      />
                    )}
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
                {!landing && !active && !solar && !aurora.run && (
                  <ObservatoryScenePicker
                    scene={scene}
                    ready={ready}
                    deepAvailable={deepAvailable}
                    onScene={(next) => {
                      observations.setQuery("");
                      if (scene === next) {
                        onHome();
                        return;
                      }
                      browser.select(next);
                      onScene(next);
                    }}
                  />
                )}
                {scene === "depth" && ready && !deepAvailable && (
                  <p id="depth-availability" className="observatory-depth-note">
                    No earthquake at least 70 km deep in this window. Recorded depth stories are still
                    available.
                  </p>
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
        </StoryDockProvider>
      </div>
      {solar && (
        <Suspense fallback={<SunLoading />}>
          <SunWatch onClose={closeSun} sample={sun.sample} />
        </Suspense>
      )}
    </section>
  );
}
