import { JourneyPicker } from "./journeys/JourneyPicker";
import { StoryThumbnail } from "./StoryThumbnail";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { ReactNode } from "react";
import { observations, type ObservationId } from "./observations/catalogue";
import { ObservatoryHistory } from "./ObservatoryHistory";
import type { EarthScene, useObservatory } from "./useObservatory";
import "./stories.css";
import { earthStories, earthStoryIds } from "./earth-stories/catalogue";
import { StorySearch } from "./StorySearch";

type Observatory = ReturnType<typeof useObservatory>;

const layers = Object.entries(observations) as [ObservationId, (typeof observations)[ObservationId]][];

function Story({
  id,
  name,
  note,
  open,
  ready,
}: {
  id: string;
  name: string;
  note: string;
  open: () => void;
  ready: boolean;
}): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      disabled={!ready}
      onClick={open}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-note`}
    >
      <StoryThumbnail id={id} />
      <span id={`${id}-title`}>{name}</span>
      <small id={`${id}-note`}>{note}</small>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="stories-group" aria-label={title}>
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

export function StoriesDrawer({
  scene,
  ready,
  sun,
  tonight,
  observations: deck,
  openArchive,
  onHistory,
  onPickDate,
  onSelect,
  onDismiss,
  aurora,
  children,
}: {
  children: ReactNode;
  scene: EarthScene;
  ready: boolean;
  sun: Observatory["sun"];
  tonight: Observatory["tonight"];
  observations: Observatory["observations"];
  openArchive: Observatory["openAfterDarkArchive"];
  onHistory: (day: string) => void;
  onPickDate: () => void;
  onSelect: () => void;
  onDismiss: () => void;
  aurora: ReturnType<typeof useAuroraOverflight>;
}): JSX.Element {
  const add = (id: ObservationId, trigger = `open-story-${id}`) => (
    <Story
      key={id}
      id={trigger}
      name={observations[id].title}
      note={observations[id].summary}
      ready={ready}
      open={() => deck.open(id, trigger)}
    />
  );
  return (
    <div
      id="stories-panel"
      className="stories-drawer"
      aria-label="Stories and layers"
      role="region"
      onClickCapture={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onDismiss();
        }
      }}
    >
      <StorySearch deck={deck} ready={ready} aurora={aurora} />
      {!deck.query.trim() && (
        <>
          {children}
          <JourneyPicker />
          <Group title="Earth stories">
            {earthStoryIds
              .filter((id) => earthStories[id].scene === scene || (scene === "live" && id === "fault"))
              .map((id) => (
                <Story
                  key={id}
                  id={`open-story-${id}`}
                  name={earthStories[id].title}
                  note={earthStories[id].summary}
                  ready={ready}
                  open={() => deck.open(id, `open-story-${id}`)}
                />
              ))}
          </Group>
          {scene === "night" ? (
            <>
              <Group title="Live">
                <Story
                  id="open-sun-watch"
                  name="Sun Watch"
                  note="Follow solar wind and X-rays."
                  ready={ready}
                  open={() => {
                    sun.toggle();
                    requestAnimationFrame(() => document.getElementById("open-observations")?.focus());
                  }}
                />
              </Group>
              <Group title="Predictions">
                {add("orbit", "open-orbital-pass")}
                <Story
                  id="open-meteor-nights"
                  name="Meteor Nights"
                  note="Find dark windows for meteor showers in your city."
                  ready={ready}
                  open={() => tonight.open("meteors")}
                />
                <Story
                  id="open-shadow-chase"
                  name="Shadow Chase"
                  note="Follow the 2027 eclipse and see it from your city."
                  ready={ready}
                  open={() => openArchive("shadow")}
                />
              </Group>
              <Group title="Replays">
                <Story
                  id="open-moonfall-story"
                  name="Moonfall"
                  note="Descend to the Apollo 17 landing site and follow the rover."
                  ready={ready}
                  open={() => tonight.open("moonfall")}
                />
                <Story
                  id="open-lights-return"
                  name="Lights Return"
                  note="See Puerto Rico’s lights return after Hurricane Maria."
                  ready={ready}
                  open={() => openArchive("lights")}
                />
              </Group>
            </>
          ) : (
            <>
              {scene === "live" && (
                <>
                  <Group title="Recent observations">
                    {layers.filter(([, view]) => view.group === "Recent observations").map(([id]) => add(id))}
                  </Group>
                  <Group title="Forecasts">
                    {layers.filter(([, view]) => view.group === "Forecasts").map(([id]) => add(id))}
                  </Group>
                </>
              )}
              <Group title="Replays">
                {scene === "live" && (
                  <>
                    {add("deep")}
                    {layers.filter(([, view]) => view.group === "Recorded journeys").map(([id]) => add(id))}
                  </>
                )}
                <ObservatoryHistory onHistory={onHistory} onPickDate={onPickDate} onStory={deck.open} />
              </Group>
            </>
          )}
        </>
      )}
    </div>
  );
}
