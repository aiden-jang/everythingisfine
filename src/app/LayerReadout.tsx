import { useId, useRef, type ReactNode } from "react";
import { layerTime } from "./layerTime";
import { RadarCanvasCredit } from "./CanvasFooter";
import type { useMapLayers } from "./useMapLayers";
import type { WeatherLayerId } from "./weatherLayers";

export function LayerReadout({
  controls,
  compact = false,
  legend,
}: {
  controls: ReturnType<typeof useMapLayers>;
  compact?: boolean;
  legend?: ReactNode;
}): JSX.Element | null {
  const id = `layer-times-${useId()}`;
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!controls.active || controls.suspended) return null;
  const weather = (["wind", "lightning"] as WeatherLayerId[]).filter(
    (id) => controls.enabled[id] && controls.weather[id]?.frame,
  );
  const hasTimes = weather.length > 0 || Boolean(controls.radar);
  if (!hasTimes && !legend) return null;
  const close = () => {
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <div className="layer-readout">
      <RadarCanvasCredit radar={controls.radar} />
      <button
        ref={trigger}
        className="layer-times-toggle"
        aria-label={compact ? "Sources & legend" : "Sources & times"}
        type="button"
        {...{ popovertarget: id }}
      >
        {compact ? (
          <span>Sources & legend</span>
        ) : (
          <span>
            Sources<span className="layer-times-suffix"> &amp; times</span>
          </span>
        )}
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="m3 4 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        className={compact ? "layer-times-popover globe-info-popover" : "layer-times-popover"}
        {...{ popover: "auto" }}
        role={compact ? "region" : "group"}
        aria-label={compact ? "Sources & legend" : "Weather layer times"}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="layer-times-heading">
          {compact && <h2>Sources & legend</h2>}
          <button
            type="button"
            autoFocus={compact}
            aria-label={compact ? "Close sources and legend" : "Close layer times"}
            onClick={close}
          >
            Close
          </button>
        </div>
        {compact && hasTimes && <h3>Scan times</h3>}
        {controls.radar && (
          <span>
            RainViewer radar ·{" "}
            {controls.radar.at === undefined ? (
              "No scan image displayed"
            ) : (
              <time dateTime={new Date(controls.radar.at).toISOString()}>{layerTime(controls.radar.at)}</time>
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
        {legend && (
          <section className="globe-info-legend" aria-label="Legend">
            <h3>Legend</h3>
            {legend}
          </section>
        )}
      </div>
    </div>
  );
}
