import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { observations, type ObservationId } from "./catalogue";
import { loadSource } from "./load";
import { ObservationCredit } from "./ObservationCredit";
import { TideGauge } from "./TideGauge";
import { ObservationPlayer } from "./ObservationPlayer";
import type { ObservationSource } from "./types";
import type { useObservationDeck } from "./useObservationDeck";
import { swellBuoys } from "./swellBuoys";

type Deck = Omit<ReturnType<typeof useObservationDeck>, "entry"> & { entry: ObservationId };

export function ObservationDeck({
  deck,
  onClose,
  closeLabel,
  city,
}: {
  deck: Deck;
  onClose: () => void;
  closeLabel: string;
  city: { name: string; select: (name: string) => void };
}): JSX.Element {
  const [photo, setPhoto] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<{ id: ObservationId; source: ObservationSource | null } | null>(null);
  const [revision, retry] = useState(0);
  const [buoy, setBuoy] = useState<string>(swellBuoys[0].id);
  const id = deck.entry;
  const meta = observations[id];
  const title = meta.title;
  const photograph = deck.view?.frame.photograph;
  const showPhoto = id === "epic" || (!deck.map && photo);
  const picker =
    id === "orbit"
      ? { value: city.name, select: city.select }
      : id === "swell"
        ? { value: buoy, select: setBuoy }
        : undefined;

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
    <>
      <div
        className="observatory-stage"
        data-stage="observation"
        role="group"
        aria-label={
          id === "epic"
            ? "DSCOVR camera view"
            : `${title} on the ${deck.map ? "map" : deck.horizon ? "horizon" : "globe"}`
        }
      >
        {photograph && showPhoto && (
          <div className="observation-photograph" data-loaded={deck.view?.image ? "true" : "false"}>
            {deck.view?.image && <img src={deck.view.image.src} alt={photograph.alt} />}
          </div>
        )}
        <div className="stage-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="stage-ident">
          <span className="stage-rule" aria-hidden="true" />
          <span>{id === "iceberg" ? "Scotia Sea · South Georgia" : meta.source}</span>
        </div>
        {!deck.map && deck.view?.frame.tide && <TideGauge tide={deck.view.frame.tide} />}
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
        <div className="stage-readout">
          {id === "epic" ? "DSCOVR camera" : deck.map ? "Map" : deck.horizon ? "Local horizon" : "Globe"} ·{" "}
          {meta.group}
        </div>
      </div>
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
              <button type="button" ref={back} onClick={onClose} aria-label={closeLabel}>
                <span className="observation-back-full">{closeLabel}</span>
                <span className="observation-back-compact">Back</span>
              </button>
            </div>
          </div>
          <p className="observation-note observation-introduction">{meta.description}</p>
          {id !== "epic" && (
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
          )}
          {id === "iceberg" && photograph && !deck.map && (
            <div className="observatory-actions">
              <button type="button" aria-pressed={photo} onClick={() => setPhoto(!photo)}>
                {photo ? "Return to tracks" : "Show satellite image"}
              </button>
            </div>
          )}
          {loaded?.id === id ? (
            loaded.source ? (
              <ObservationPlayer
                key={id}
                id={id}
                source={loaded.source}
                horizon={deck.horizon}
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
            <p className="observation-note" role="status">
              Opening {title}…
            </p>
          )}
          {id === "iceberg" && (
            <details className="observation-details">
              <summary>Satellite image sources</summary>
              <div className="lights-links">
                <a
                  href="https://science.nasa.gov/earth/earth-observatory/iceberg-a-68a-nears-south-georgia-147535/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Terra MODIS
                </a>
                <a
                  href="https://science.nasa.gov/earth/earth-observatory/iceberg-goes-with-the-flow-147715/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Landsat 8
                </a>
                <a
                  href="https://science.nasa.gov/earth/earth-observatory/pieces-of-iceberg-a-68a-147785/"
                  target="_blank"
                  rel="noreferrer"
                >
                  NOAA-20 VIIRS
                </a>
                <a
                  href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
                  target="_blank"
                  rel="noreferrer"
                >
                  OGL v3.0
                </a>
              </div>
            </details>
          )}
        </section>
        <ObservationCredit />
      </div>
    </>
  );
}
