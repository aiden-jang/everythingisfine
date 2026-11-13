import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ObservationData, ObservationFrame, ObservationSource } from "./types";
import { useObservationData } from "./useObservationData";
import { nearest } from "../../sources/observations/common";
import { refreshAnnotations } from "../../globe/annotationInput";
import { layerTime } from "../layerTime";

export function matchingMeasurements(a: ObservationFrame, b: ObservationFrame) {
  return (a.measurements ?? []).flatMap((item) => {
    const other = b.measurements?.find(({ label }) => label === item.label);
    return other ? [{ label: item.label, a: item.value, b: other.value }] : [];
  });
}

export function PlaceComparison({
  source,
  option,
  data,
  frame,
  tide,
}: {
  source: ObservationSource;
  option: string;
  data: ObservationData;
  frame: ObservationFrame;
  tide: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [second, setSecond] = useState("");
  return (
    <details className="place-comparison" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Compare another place</summary>
      {open && (
        <>
          <label className="observation-picker">
            <span>Second place</span>
            <select
              value={second === option ? "" : second}
              onChange={(event) => setSecond(event.currentTarget.value)}
            >
              <option value="">Choose a place</option>
              {source.options
                ?.filter(({ id }) => id !== option)
                .map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          {second && second !== option && (
            <ComparedPlaces
              source={source}
              first={option}
              second={second}
              data={data}
              frame={frame}
              tide={tide}
            />
          )}
        </>
      )}
    </details>
  );
}

function ComparedPlaces({
  source,
  first,
  second,
  data,
  frame,
  tide,
}: {
  source: ObservationSource;
  first: string;
  second: string;
  data: ObservationData;
  frame: ObservationFrame;
  tide: boolean;
}) {
  const remote = useObservationData(source, second);
  const other = remote.data ? nearest(remote.data.frames, frame.at, ({ at }) => at) : undefined;
  const firstName = source.options?.find(({ id }) => id === first)?.label ?? first;
  const otherName = source.options?.find(({ id }) => id === second)?.label ?? second;
  const rows = other ? matchingMeasurements(frame, other) : [];
  useLayoutEffect(() => refreshAnnotations(), [data, remote.data]);
  const stage = document.querySelector(".zones");
  return (
    <>
      {remote.state !== "ready" && (
        <p role="status" className="observation-note">
          {remote.state === "loading"
            ? `Loading ${otherName}…`
            : remote.state === "empty"
              ? `No observations available for ${otherName}.`
              : `Couldn’t load ${otherName}.`}
          {remote.state === "failed" && (
            <button type="button" onClick={remote.retry}>
              Retry comparison
            </button>
          )}
        </p>
      )}
      {other && (
        <>
          <div className="comparison-places">
            {[
              { name: firstName, at: frame.at, target: data.target },
              { name: otherName, at: other.at, target: remote.data!.target },
            ].map((place) => (
              <button type="button" key={place.name} onClick={() => refreshAnnotations(place.target)}>
                <strong>{place.name}</strong>
                <small>{layerTime(place.at)}</small>
                <span>Locate</span>
              </button>
            ))}
          </div>
          <table className="comparison-table">
            <caption>Same source and measurement definitions</caption>
            <thead>
              <tr>
                <th>Measurement</th>
                <th>{firstName}</th>
                <th>{otherName}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.a}</td>
                  <td>{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="observation-note">
            {frame.at === other.at
              ? "Both observations are from the same time."
              : "Times differ. The second place uses its nearest available observation; values are not interpolated."}
            {tide &&
              " Water levels use each station’s local mean lower low water, not a shared global height datum."}
          </p>
          {remote.state !== "ready" && (
            <p className="observation-note">The second place shows its last available readings.</p>
          )}
          {stage &&
            createPortal(
              <div className="comparison-anchors" aria-hidden="true">
                <span data-observation-anchor="" data-lon={data.target.lon} data-lat={data.target.lat}>
                  {firstName}
                </span>
                <span
                  data-observation-anchor=""
                  data-lon={remote.data!.target.lon}
                  data-lat={remote.data!.target.lat}
                >
                  {otherName}
                </span>
              </div>,
              stage,
            )}
        </>
      )}
    </>
  );
}
