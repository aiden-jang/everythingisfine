import { layerMetadata } from "./layerMetadata";
import type { MapLayer } from "./layerVisibility";
import type { FeedStatus } from "./feedStatus";
import { layerTime } from "./layerTime";

const sourceLinks: Record<string, string> = {
  usgs: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/",
  emsc: "https://www.seismicportal.eu/fdsn-wsevent.html",
  cyclones: "https://www.gdacs.org/",
  fires: "https://www.gdacs.org/",
  floods: "https://www.gdacs.org/",
  volcanoes: "https://www.gdacs.org/",
  aurora: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
  radar: "https://www.rainviewer.com/",
  wind: "https://www.nco.ncep.noaa.gov/pmb/products/gfs/",
  lightning: "https://www.star.nesdis.noaa.gov/goes/",
};

export function LayerSources({ layer, feeds }: { layer: MapLayer; feeds: FeedStatus }) {
  const meta = layerMetadata[layer];
  return (
    <details className="layer-sources">
      <summary>About this layer & sources</summary>
      <p>{meta.meaning}</p>
      <dl>
        {feeds.rows
          .filter((row) => meta.sources.includes(row.id))
          .map((row) => (
            <div key={row.id}>
              <dt>
                <a
                  href={sourceLinks[row.id]}
                  target="_blank"
                  rel="noreferrer"
                  aria-describedby="external-link-hint"
                >
                  {row.label}
                </a>
              </dt>
              <dd>
                {row.state === "pending"
                  ? "Checking source…"
                  : row.state === "failed"
                    ? "Source unavailable"
                    : row.state === "off"
                      ? "Not active in this view"
                      : "Source available"}
                {row.lastCheck !== undefined && (
                  <>
                    {" "}
                    · Checked{" "}
                    <time dateTime={new Date(row.lastCheck).toISOString()}>{layerTime(row.lastCheck)}</time>
                  </>
                )}
                {row.message && <p>{row.message}</p>}
              </dd>
            </div>
          ))}
      </dl>
      <p>Source check times describe availability. Each observation or forecast retains its own time.</p>
    </details>
  );
}
