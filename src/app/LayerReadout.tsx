import { useId, useRef } from "react";
import { layerTime } from "./layerTime";
import { RadarCanvasCredit } from "./CanvasFooter";
import type { useMapLayers } from "./useMapLayers";
import type { WeatherLayerId } from "./weatherLayers";

export function LayerReadout({
  controls,
}: {
  controls: ReturnType<typeof useMapLayers>;
}): JSX.Element | null {
  const id = `layer-times-${useId()}`;
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!controls.active) return null;
  const weather = (["wind", "lightning"] as WeatherLayerId[]).filter(
    (id) => controls.enabled[id] && controls.weather[id]?.frame,
  );
  const close = () => {
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <div className="layer-readout">
      <RadarCanvasCredit radar={controls.radar} />
      {(weather.length > 0 || controls.radar) && (
        <>
          <button ref={trigger} className="layer-times-toggle" type="button" {...{ popovertarget: id }}>
            Sources & times
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="m3 4 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <div
            ref={panel}
            id={id}
            className="layer-times-popover"
            {...{ popover: "auto" }}
            role="group"
            aria-label="Weather layer times"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
          >
            <button type="button" onClick={close}>
              Close layer times
            </button>
            {controls.radar && (
              <span>
                RainViewer radar ·{" "}
                {controls.radar.at === undefined ? (
                  "No scan image displayed"
                ) : (
                  <time dateTime={new Date(controls.radar.at).toISOString()}>
                    {layerTime(controls.radar.at)}
                  </time>
                )}
              </span>
            )}
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
        </>
      )}
    </div>
  );
}
