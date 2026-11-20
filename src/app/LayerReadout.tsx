import { useEffect, useId, useRef, type ReactNode } from "react";
import { layerTime } from "./layerTime";
import { RadarCanvasCredit } from "./CanvasFooter";
import type { useMapLayers } from "./useMapLayers";
import type { WeatherLayerId } from "./weatherLayers";
import { mapLayerNames, type MapLayer } from "./layerVisibility";

export function LayerReadout({
  controls,
  withLegend = false,
  legend,
}: {
  controls: ReturnType<typeof useMapLayers>;
  withLegend?: boolean;
  legend?: ReactNode;
}): JSX.Element | null {
  const id = `layer-times-${useId()}`;
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const resize = () => {
      if (panel.current?.matches(":popover-open") && trigger.current) {
        positionReadout(trigger.current, panel.current);
      }
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  if (controls.suspended || (!controls.active && !legend)) return null;
  const weather = (["wind", "lightning"] as WeatherLayerId[]).filter(
    (id) => controls.active && controls.enabled[id] && controls.weather[id]?.frame,
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
        aria-label={withLegend ? "Sources & legend" : "Sources & times"}
        type="button"
        {...{ popovertarget: id }}
        onClick={() => {
          if (trigger.current && panel.current) positionReadout(trigger.current, panel.current);
        }}
      >
        {withLegend ? (
          <span>
            Sources<span className="layer-times-suffix"> &amp; legend</span>
          </span>
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
        className={withLegend ? "layer-times-popover globe-info-popover" : "layer-times-popover"}
        {...{ popover: "auto" }}
        role={withLegend ? "region" : "group"}
        aria-label={withLegend ? "Sources & legend" : "Weather layer times"}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="layer-times-heading">
          {withLegend && <h2>Sources & legend</h2>}
          <button
            type="button"
            autoFocus={withLegend}
            aria-label={withLegend ? "Close sources and legend" : "Close layer times"}
            onClick={close}
          >
            Close
          </button>
        </div>
        {withLegend && (
          <div className="layer-times-enabled">
            <h3>Enabled layers</h3>
            <p>
              {(Object.keys(mapLayerNames) as MapLayer[])
                .filter((id) => controls.visible[id])
                .map((id) => mapLayerNames[id])
                .join(" · ") || "All layers are off."}
            </p>
          </div>
        )}
        {withLegend && hasTimes && <h3>Displayed times</h3>}
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

function positionReadout(trigger: HTMLButtonElement, panel: HTMLDivElement) {
  const { top, left } = trigger.getBoundingClientRect();
  panel.style.setProperty("--layer-times-bottom", `${Math.max(12, window.innerHeight - top + 8)}px`);
  panel.style.setProperty("--layer-times-left", `${left}px`);
}
