import type { ReactNode } from "react";
import { observations, type ObservationId } from "./observations/catalogue";
import { ObservatoryHistory } from "./ObservatoryHistory";
import type { EarthScene, useObservatory } from "./useObservatory";
import "./stories.css";

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
}: {
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
    </div>
  );
}
