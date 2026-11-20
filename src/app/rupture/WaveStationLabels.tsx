import type { WavePin } from "./RecordedWaves";

export function WaveStationLabels({ pins }: { pins: WavePin[] | null }) {
  return (
    <div className="recorded-anchors" aria-hidden="true">
      {pins ? (
        pins.map(({ id, lon, lat, name, reached }, index) => (
          <span
            key={id}
            data-observation-anchor=""
            data-wave-station={id}
            data-second={index === 1 || undefined}
            data-reached={reached || undefined}
            data-lon={lon}
            data-lat={lat}
          >
            {name.split(",")[0]}
          </span>
        ))
      ) : (
        <span data-observation-anchor="" data-lon={142.373} data-lat={38.297}>
          Epicenter
        </span>
      )}
    </div>
  );
}
