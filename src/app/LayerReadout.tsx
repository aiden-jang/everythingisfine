import { layerTime } from "./layerTime";
import { RadarCanvasCredit } from "./CanvasFooter";
import type { useMapLayers } from "./useMapLayers";
import type { WeatherLayerId } from "./weatherLayers";

export function LayerReadout({
  controls,
}: {
  controls: ReturnType<typeof useMapLayers>;
}): JSX.Element | null {
  if (!controls.active) return null;
  const weather = (["wind", "lightning"] as WeatherLayerId[]).filter(
    (id) => controls.enabled[id] && controls.weather[id]?.frame,
  );
  return (
    <>
      <RadarCanvasCredit radar={controls.radar} />
      {weather.length > 0 && (
        <div className="weather-canvas-readout" role="group" aria-label="Weather layer times">
          {weather.map((id) => {
            const view = controls.weather[id]!;
            const time = new Date(view.frame!.at).toISOString();
            return (
              <span key={id}>
                {id === "wind" ? "GFS wind forecast" : "GOES-East lightning"} ·{" "}
                <time dateTime={time}>{layerTime(view.frame!.at)}</time>
                {view.lastAvailable ? " · last available" : ""}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}
