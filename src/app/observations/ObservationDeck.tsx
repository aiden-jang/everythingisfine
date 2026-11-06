import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { observations, type ObservationId } from "./catalogue";
import { loadSource } from "./load";
import { ObservationCredit } from "./ObservationCredit";
import { TideGauge } from "./TideGauge";
import { ObservationPlayer } from "./ObservationPlayer";
import type { ObservationSource } from "./types";
import type { useObservationDeck } from "./useObservationDeck";

const groups = ["Recent observations", "Forecasts", "After Dark", "Recorded journeys"] as const;
const entries = Object.entries(observations) as [ObservationId, (typeof observations)[ObservationId]][];

type Deck = Omit<ReturnType<typeof useObservationDeck>, "entry"> & {
  entry: ObservationId | "catalogue";
};

export function ObservationDeck({ deck, onClose }: { deck: Deck; onClose: () => void }): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<{ id: ObservationId; source: ObservationSource | null } | null>(null);
  const [revision, retry] = useState(0);
  const id = deck.entry === "catalogue" ? null : deck.entry;
  const meta = id ? observations[id] : null;
  const title = meta?.title ?? "Observatory views";

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), [id]);
  useObservatoryEscape(onClose);

  useEffect(() => {
    if (!id) return;
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
    <>
      {meta && (
        <div
          className="observatory-stage"
          data-stage="observation"
          role="group"
          aria-label={`${title} on the ${deck.map ? "map" : deck.horizon ? "horizon" : "globe"}`}
        >
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
            {deck.map ? "Map" : deck.horizon ? "Local horizon" : "Globe"} · {meta.group}
          </div>
        </div>
      )}
      <div className="observatory-sidebar">
        <section
          id="observatory-intro"
          className="observatory-intro observation-panel"
          tabIndex={-1}
          aria-label={title}
          data-observation={deck.entry}
        >
          <div className="observation-heading">
            <h2>{title}</h2>
            <div className="observatory-actions">
              <button type="button" ref={back} onClick={id ? () => deck.open("catalogue") : onClose}>
                {id ? (
                  <>
                    <span className="observation-back-full">Back to observatory views</span>
                    <span className="observation-back-compact">Back to views</span>
                  </>
                ) : (
                  "Back to Observatory"
                )}
              </button>
            </div>
          </div>
          {id && meta ? (
            <>
              <p className="observation-note observation-introduction">{meta.description}</p>
              <div
                className="observatory-actions observation-projection"
                role="group"
                aria-label="Observation projection"
              >
                <button
                  type="button"
                  aria-pressed={!deck.map && !deck.horizon}
                  onClick={() => {
                    deck.setMap(false);
                    deck.setHorizon(false);
                  }}
                >
                  Globe
                </button>
                <button
                  type="button"
                  aria-pressed={deck.map}
                  onClick={() => {
                    deck.setHorizon(false);
                    deck.setMap(true);
                  }}
                >
                  Map
                </button>
                {id === "orbit" && (
                  <button
                    type="button"
                    aria-pressed={deck.horizon}
                    onClick={() => {
                      deck.setMap(false);
                      deck.setHorizon(true);
                    }}
                  >
                    Local sky
                  </button>
                )}
              </div>
              {loaded?.id === id ? (
                loaded.source ? (
                  <ObservationPlayer
                    key={id}
                    id={id}
                    source={loaded.source}
                    horizon={deck.horizon}
                    map={deck.map}
                    update={deck.update}
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
                <p className="observation-note" role="status">
                  Opening {title}…
                </p>
              )}
            </>
          ) : (
            groups.map((group) => (
              <section className="observation-index" key={group}>
                <h3>{group}</h3>
                <ul>
                  {entries
                    .filter(([, item]) => item.group === group)
                    .map(([key, item]) => (
                      <li key={key}>
                        <button type="button" onClick={() => deck.open(key)}>
                          {item.title}
                          <small>{item.source}</small>
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          )}
        </section>
        <ObservationCredit />
      </div>
    </>
  );
}
