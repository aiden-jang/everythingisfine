import { layerMetadata } from "./layerMetadata";
import type { MapLayer } from "./layerVisibility";
import { feedSourceLinks, type FeedStatus } from "./feedStatus";
import { layerTime } from "./layerTime";

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
                  href={feedSourceLinks[row.id]}
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
