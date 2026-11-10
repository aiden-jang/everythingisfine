import { StoryNavigation } from "./journeys/StoryNavigation";
import { ExperienceEnding } from "./journeys/ExperienceEnding";
import { lazy, Suspense, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  ObservatoryStage,
  ObservatoryScenePicker,
  ObservatoryFeatured,
  SunCredits,
  TourUnavailable,
} from "./ObservatoryStage";
import { ObservatoryTourControls } from "./ObservatoryTourControls";
import { FeaturedStory } from "./FeaturedStory";
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
import "./measurement-sound.css";
import "./moonfall/moonfall.css";
import { ObservationCredit } from "./observations/ObservationCredit";
import { ObservationDeckShell } from "./observations/ObservationEntry";

const SunWatch = lazy(() => import("./sun/SunWatch").then(({ SunWatch }) => ({ default: SunWatch })));

const TonightSky = lazy(() =>
  import("./tonight/TonightSky").then(({ TonightSky }) => ({ default: TonightSky })),
);
const TonightCompass = lazy(() =>
  import("./tonight/TonightCompass").then(({ TonightCompass }) => ({ default: TonightCompass })),
);

const FloatDive = lazy(() =>
  import("./float/FloatDivePanel").then(({ FloatDivePanel }) => ({ default: FloatDivePanel })),
);
export interface ObservatoryProps {
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
    "sun" | "tonight" | "floatDive" | "observations" | "skyCity" | "openAfterDarkArchive" | "closeStory"
  >;
  radar: ReturnType<typeof useObservatory>["radar"];
  onScene: (scene: EarthScene) => void;
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
  return (
    <StoryNavigation {...props}>
      <ObservatoryContent {...props} />
    </StoryNavigation>
  );
}

function ObservatoryContent({
  scene,
  at,
  ready,
  empty,
  summary,
  deepAvailable,
  aurora,
  views: { sun, tonight, floatDive, observations, skyCity, openAfterDarkArchive, closeStory },
  radar,
  feedNote,
  onScene,
  onExplore,
  onPickDate,
  tour,
  onHistory,
}: ObservatoryProps): JSX.Element {
  const [stories, setStories] = useState(false);
  const storyScroll = useRef(0);
  useLayoutEffect(() => {
    tour.controls.current?.scrollTo(0, stories && !tonight.active && !sun.active ? storyScroll.current : 0);
    tour.controls.current?.querySelector<HTMLElement>(".observatory-story")?.scrollTo(0, 0);
  }, [
    scene,
    tour.at,
    tour.controls,
    radar.active,
    tonight.active,
    floatDive.active,
    observations.entry,
    stories,
    sun.active,
  ]);
  const closeSun = () => observations.returnTo("open-sun-watch", sun.toggle);
  const openFeatured = () => {
    onScene("night");
    observations.setTrigger("open-featured-moonfall");
    tonight.open("moonfall");
  };
  const active = tour.at !== null;
  const solar = sun.active && !active;
  const title = active
    ? (tour.stop?.heading ?? "Taking the long way around.")
    : scene === "depth"
      ? "Beneath the surface."
      : scene === "night"
        ? solar
          ? "Sun Watch"
          : aurora.run
            ? "Into the auroral oval."
            : "The other side of day."
        : "Meanwhile, on Earth.";
  const description = active
    ? (tour.stop?.description ?? "Travelling to the next view. The story begins when the camera arrives.")
    : scene === "depth"
      ? "Look through a regional cutaway at reported earthquake depths. The faint points show historical seismicity."
      : scene === "night"
        ? solar
          ? "See what GOES measures in X-rays and what spacecraft sample in the solar wind upstream of Earth. Aurora has its own forecast."
          : aurora.run
            ? "Follow NOAA’s forecast over Earth’s dark side. The raised glow illustrates the modeled oval."
            : "Earth settles into the horizon as constellations trace overhead. The sky follows the UTC readout."
        : "A live view of earthquakes, changing skies, and a restless planet.";
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
        <FloatReadout view={floatDive.view} />
      ) : radar.active ? (
        <RadarReadout map={observations.map} />
      ) : tonight.view?.moonfall ? (
        <MoonfallReadout view={tonight.view.moonfall} />
      ) : tonight.active ? (
        <Suspense fallback={null}>
          <TonightCompass view={tonight.view} onView={tonight.update} />
        </Suspense>
      ) : (
        !solar && (
          <ObservatoryStage scene={scene} at={at} tour={active ? tour.stop : undefined} aurora={aurora.run} />
        )
      )}
      <div className="observatory-sidebar">
        <section
          id="observatory-intro"
          tabIndex={-1}
          className="observatory-intro"
          ref={tour.controls}
          data-scene={active ? "tour" : scene}
          data-browsing={(stories && !active && !solar) || undefined}
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
                onView={floatDive.update}
                onClose={() => observations.returnTo("open-float-dive", floatDive.close)}
              />
            </Suspense>
          ) : radar.active ? (
            <StormRadar
              projection={observations}
              fromExplore={radar.fromExplore}
              entry={radar.entry}
              onView={radar.update}
              onClose={() => {
                const trigger = radar.fromExplore ? "open-explorer-radar" : "open-storm-radar";
                observations.returnTo(trigger, radar.close);
              }}
            />
          ) : tonight.active ? (
            <Suspense fallback={<p role="status">Opening Tonight’s Sky…</p>}>
              <TonightSky
                key={tonight.entry.revision}
                view={tonight.view}
                onView={tonight.update}
                preference={skyCity}
                initialMode={tonight.entry.mode}
                initialLook={tonight.entry.look}
                initialMoment={tonight.entry.moment}
                returnLabel={
                  observations.trigger === "open-featured-moonfall"
                    ? "Back to Live Earth"
                    : "Back to After Dark"
                }
                onClose={() => {
                  const id =
                    tonight.entry.mode === "meteors"
                      ? "open-meteor-nights"
                      : tonight.entry.mode === "moonfall"
                        ? "open-moonfall-story"
                        : "open-tonight-sky";
                  observations.returnTo(id, () => {
                    tonight.close();
                    if (observations.trigger === "open-featured-moonfall") onScene("live");
                  });
                }}
              />
            </Suspense>
          ) : (
            <>
              <div className="observatory-story" aria-live="polite" aria-atomic="true">
                <h2 key={title}>{title}</h2>
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
                  <div className="observatory-actions observatory-entry-actions">
                    <button type="button" onClick={onExplore} className="observatory-primary">
                      Explore the globe <span aria-hidden="true">↗</span>
                    </button>
                    <button
                      type="button"
                      id="open-observations"
                      aria-controls={stories && !solar ? "stories-panel" : undefined}
                      aria-expanded={solar ? undefined : stories}
                      onClick={
                        solar
                          ? closeSun
                          : () => {
                              if (!stories) storyScroll.current = 0;
                              setStories(!stories);
                            }
                      }
                    >
                      {solar ? "Back to stars" : "Stories & layers"}
                    </button>
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
                  {scene !== "night" ? (
                    <p
                      id={ready && !tour.available ? "tour-availability" : undefined}
                      className="observatory-summary"
                    >
                      {summary}
                    </p>
                  ) : null}
                </>
              )}
              {!active && !solar && !stories && scene === "live" && (
                <FeaturedStory ready={ready} open={openFeatured} />
              )}
              {!active && !solar && stories && (
                <StoriesDrawer
                  scene={scene}
                  ready={ready}
                  sun={sun}
                  tonight={tonight}
                  observations={observations}
                  openArchive={openAfterDarkArchive}
                  aurora={aurora}
                  onHistory={onHistory}
                  onPickDate={onPickDate}
                  onSelect={() => {
                    storyScroll.current = tour.controls.current?.scrollTop ?? 0;
                  }}
                  onDismiss={() => {
                    setStories(false);
                    document.getElementById("open-observations")?.focus();
                  }}
                />
              )}
              {!active && (
                <ObservatoryScenePicker
                  scene={scene}
                  ready={ready}
                  deepAvailable={deepAvailable}
                  onScene={(next) => {
                    if (scene !== next) setStories(false);
                    onScene(next);
                  }}
                />
              )}
              {!active && ready && !deepAvailable && (
                <p id="depth-availability" className="observatory-depth-note">
                  Below the Surface needs an earthquake at least 70 km deep in the current view.
                </p>
              )}
              {!active && scene === "night" ? (
                <AuroraOverflightControls
                  aurora={aurora}
                  ready={ready}
                  solar={solar}
                  onReturn={() => observations.returnTo("open-aurora-overflight", () => onScene("night"))}
                  onSunWatch={sun.toggle}
                  onTonight={() => tonight.open()}
                  city={skyCity}
                />
              ) : null}
              {!active && scene !== "night" && (
                <ObservatoryFeatured
                  scene={scene}
                  ready={ready}
                  radar={radar.open}
                  dive={floatDive.open}
                  deep={() => observations.open("deep", "open-deep-time")}
                />
              )}
              {feedNote ? (
                <p className="observatory-source-note" role="status">
                  {feedNote}
                </p>
              ) : null}
            </>
          )}
          {(floatDive.active || radar.active || solar || aurora.run) && <ExperienceEnding />}
        </section>
        <ObservationCredit />
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
