import { createPortal } from "react-dom";
import { ORIGIN, stations } from "./tongaTimeline";
import type { TongaStation } from "./useTongaPlayback";

export type TongaPhase = "discover" | "follow" | "inspect" | "kept" | "shared";

export function TongaWorld({
  phase,
  station,
  onInspect,
}: {
  phase: TongaPhase;
  station: TongaStation;
  onInspect: (station: TongaStation) => void;
}) {
  const ordered = [station, ...stations.filter(({ id }) => id !== station.id)];
  return (
    <>
      <div className="tonga-world-anchors" aria-label="Recorded pressure stations">
        <span
          className="tonga-origin-label"
          data-observation-anchor=""
          data-lon={ORIGIN.lon}
          data-lat={ORIGIN.lat}
        >
          Tonga
        </span>
        {ordered.map((item) => (
          <button
            key={item.id}
            type="button"
            data-observation-anchor=""
            data-lon={item.lon}
            data-lat={item.lat}
            data-evidence-source={
              (phase === "inspect" || phase === "shared") && item.id === station.id ? "true" : undefined
            }
            onClick={() => onInspect(item)}
            aria-label={`Inspect ${item.name} pressure`}
          >
            <span className="tonga-station-point" aria-hidden="true" />
            <span>
              {item.name}
              <small>{item.id} · station pressure</small>
            </span>
          </button>
        ))}
      </div>
      {(phase === "inspect" || phase === "shared" || phase === "kept") && (
        <div className="tonga-world-title" aria-hidden="true">
          {phase === "inspect" ? (
            <>
              A pulse,
              <br />
              recorded.
            </>
          ) : phase === "kept" ? (
            <>
              A moment
              <br />
              worth keeping.
            </>
          ) : (
            <>
              A pulse,
              <br />
              across the Pacific.
            </>
          )}
        </div>
      )}
      {createPortal(
        <svg className="world-evidence-connector" data-evidence-connector="" aria-hidden="true">
          <path fill="none" />
          <circle r="3" />
        </svg>,
        document.querySelector(".zones") ?? document.body,
      )}
    </>
  );
}
