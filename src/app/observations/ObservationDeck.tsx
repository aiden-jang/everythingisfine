import { StoryDeparture } from "./StoryDeparture";
import { SharedStory } from "./SharedStory";
import { StoryLoading } from "../StoryLoading";
import { ExperienceEnding } from "../journeys/ExperienceEnding";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { observations, type ObservationId } from "./catalogue";
import { loadSource } from "./load";
import { TideGauge } from "./TideGauge";
import { ObservationPlayer } from "./ObservationPlayer";
import type { ObservationSource } from "./types";
import type { useObservationDeck } from "./useObservationDeck";
import { swellBuoys } from "./swellBuoys";
import { StoryDockProvider } from "./StoryDock";
import { StoryProjection } from "./StoryProjection";

import { ShareMoment, useStorySession } from "./StorySession";

type Deck = Omit<ReturnType<typeof useObservationDeck>, "entry"> & {
  entry: Exclude<ObservationId, "iceberg" | "orbit">;
};

export function ObservationDeck({
  deck,
  onClose,
  closeLabel,
}: {
  deck: Deck;
  onClose: () => void;
  closeLabel: string;
}): JSX.Element {
  const { initial } = useStorySession();
  const back = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<{ id: ObservationId; source: ObservationSource | null } | null>(null);
  const [revision, retry] = useState(0);
  const [buoy, setBuoy] = useState<string>(
    swellBuoys.find((b) => b.id === initial?.choice)?.id ?? swellBuoys[0].id,
  );
  const id = deck.entry;
  const meta = observations[id];
  const title = meta.title;
  const photograph = deck.view?.frame.photograph;
  const picker = id === "swell" ? { value: buoy, select: setBuoy } : undefined;

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), [id]);
  useObservatoryEscape(onClose);

  useEffect(() => {
    let active = true;
    void loadSource[id]().then(
      (source) => {
        if (active) setLoaded({ id, source });
      },
      () => {
        if (active) setLoaded({ id, source: null });
      },
    );
    return () => {
      active = false;
    };
  }, [id, revision]);

  return (
    <section className="replay-region" aria-label={title}>
      <div
        className="observatory-stage replay-stage"
        data-stage="observation"
        role="group"
        aria-label={id === "epic" ? "DSCOVR camera view" : `${title} on the ${deck.map ? "map" : "globe"}`}
      >
        {photograph && id === "epic" && (
          <div className="observation-photograph" data-loaded={deck.view?.image ? "true" : "false"}>
            {deck.view?.image && <img src={deck.view.image.src} alt={photograph.alt} />}
          </div>
        )}
        <StoryDeparture />
        <div className="stage-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="stage-ident">
          <span className="stage-rule" aria-hidden="true" />
          <span>{meta.source}</span>
        </div>
        {!deck.map && deck.view?.frame.tide && <TideGauge tide={deck.view.frame.tide} />}
        <div className="stage-readout">
          {id === "epic" ? "DSCOVR camera" : deck.map ? "Map" : "Globe"} · {meta.group}
        </div>
        {id !== "epic" && (
          <StoryProjection map={deck.map} onMap={deck.setMap}>
            {id === "swell" && (
              <div className="swell-buoys" role="group" aria-label="Pacific buoys">
                {swellBuoys.map(({ id, short, label }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={buoy === id}
                    aria-label={`Show ${label} buoy`}
                    onClick={() => setBuoy(id)}
                  >
                    {short}
                  </button>
                ))}
              </div>
            )}
          </StoryProjection>
        )}
      </div>
      <div className="observatory-sidebar replay-sidebar">
        <StoryDockProvider>
          <div
            id="observatory-intro"
            className="observatory-intro observation-panel"
            tabIndex={-1}
            data-observation={deck.entry}
          >
            <div className="observation-heading">
              <h2>{title}</h2>
              <div className="observatory-actions">
                <button type="button" ref={back} onClick={onClose} aria-label={closeLabel}>
                  <span className="observation-back-full">{closeLabel}</span>
                  <span className="observation-back-compact">Back</span>
                </button>
              </div>
            </div>
            <p className="observation-note observation-introduction">{meta.description}</p>
            <SharedStory />
            {loaded?.id === id ? (
              loaded.source ? (
                <ObservationPlayer
                  key={id}
                  id={id}
                  source={loaded.source}
                  map={deck.map}
                  update={deck.update}
                  {...(picker ? { picker } : {})}
                />
              ) : (
                <div className="observation-note" role="status">
                  <p>This view couldn’t open.</p>
                  <div className="observatory-actions">
                    <button type="button" onClick={() => retry((value) => value + 1)}>
                      Try again
                    </button>
                  </div>
                </div>
              )
            ) : (
              <StoryLoading>Opening {title}…</StoryLoading>
            )}
            <ShareMoment />
            <ExperienceEnding />
          </div>
        </StoryDockProvider>
      </div>
    </section>
  );
}
