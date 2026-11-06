import { useEffect, useId, useRef, useState } from "react";
import type { RadarScan } from "../../sources/radar";
import { RadarMap } from "./RadarMap";
import { radarRegions, strongestRegion, type RadarRegion } from "./radarCamera";
import { useRadarScans } from "./useRadarScans";

const format = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
  hourCycle: "h23",
});
const label = (at: number) => format.format(at) + " UTC";
const shortTime = (at: number) => new Date(at).toISOString().slice(11, 16);

export function RadarStage(): JSX.Element {
  const id = useId();
  const held = useRef<RadarScan | null>(null);
  const { scans, images, status, checkedAt, retry } = useRadarScans(held);
  const [chosen, setChosen] = useState<RadarScan | null>(null);
  const [playing, setPlaying] = useState(false);
  const [regionId, setRegionId] = useState("auto");
  const [focus, setFocus] = useState<RadarRegion | null | undefined>();
  const latest = scans.at(-1);
  const latestImage = latest && images.get(latest.id);
  const candidate = chosen && scans.findIndex(({ at }) => at === chosen.at);
  const index = candidate !== null && candidate >= 0 ? candidate : Math.max(0, scans.length - 1);
  const selected = scans[index];
  const image = selected && images.get(selected.id);
  const region = regionId === "auto" ? (focus ?? undefined) : radarRegions.find(({ id }) => id === regionId);

  function seek(scan: RadarScan | null) {
    held.current = scan;
    setChosen(scan);
  }

  useEffect(() => {
    if (!latestImage || focus !== undefined) return;
    setFocus(strongestRegion(latestImage) ?? null);
  }, [focus, latestImage]);

  useEffect(() => {
    if (!playing || !selected || image === undefined || document.hidden) return;
    const next = scans[index + 1];
    const timer = window.setTimeout(
      () => {
        seek(next ?? null);
        if (!next) setPlaying(false);
      },
      index === scans.length - 1 ? 820 : 510,
    );
    return () => window.clearTimeout(timer);
  }, [image, index, playing, scans, selected]);

  useEffect(() => {
    function visibility() {
      if (document.hidden) setPlaying(false);
    }
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  const place = region?.name ?? "Contiguous United States";
  const delayed = latest !== undefined && checkedAt - latest.at > 20 * 60_000;
  const statusText =
    status === "loading"
      ? "Connecting to NOAA…"
      : status === "empty"
        ? "NOAA’s catalogue has no scans."
        : status === "error"
          ? "NOAA’s catalogue is unavailable."
          : image === null
            ? "This scan’s image is unavailable."
            : image === undefined
              ? "Loading the selected scan…"
              : delayed
                ? "NOAA’s latest scan is delayed."
                : regionId === "auto" && region
                  ? "Automatic focus · area with visible returns"
                  : "Select a time to compare the observed scans.";
  const canRetry = status === "error" || status === "empty" || image === null;
  const atLatest = index === scans.length - 1 && chosen === null;
  const timeLabel = selected ? label(selected.at) : "Waiting for scans";

  function togglePlay() {
    if (!playing && index === scans.length - 1) seek(scans[0] ?? null);
    setPlaying(!playing);
  }

  return (
    <>
      <RadarMap region={region} image={image ?? null} />
      <div className="archive-scene-console radar-console">
        <div className="archive-scene-caption radar-reading">
          <div className="radar-place">
            <h3>{place}</h3>
            <label>
              <span className="sr-only">Radar region</span>
              <select value={regionId} onChange={(event) => setRegionId(event.currentTarget.value)}>
                <option value="auto">Auto focus</option>
                <option value="national">United States</option>
                {radarRegions.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>{statusText}</p>
          {canRetry && (
            <button type="button" className="radar-retry" onClick={retry}>
              Retry NOAA
            </button>
          )}
        </div>
        <div className="radar-transport">
          <div className="radar-clock">
            <label htmlFor={id}>{atLatest ? "Latest scan" : "Scan time"}</label>
            {selected && <time dateTime={new Date(selected.at).toISOString()}>{timeLabel}</time>}
          </div>
          <input
            id={id}
            className="scrub-slider radar-scrub"
            type="range"
            min={0}
            max={Math.max(0, scans.length - 1)}
            value={index}
            disabled={scans.length < 2}
            aria-label="Radar scan time"
            aria-valuetext={timeLabel}
            onChange={(event) => {
              setPlaying(false);
              seek(scans[event.currentTarget.valueAsNumber] ?? null);
            }}
          />
          <div className="radar-actions">
            <span>
              {scans[0] && latest ? `${shortTime(scans[0].at)}–${shortTime(latest.at)} UTC` : "Recent scans"}
            </span>
            <button
              type="button"
              className="archive-scene-button"
              disabled={scans.length < 2}
              onClick={togglePlay}
            >
              {playing ? "Pause" : "Play scans"}
            </button>
            <button
              type="button"
              className="archive-scene-button"
              disabled={!selected}
              onClick={() => {
                setPlaying(false);
                seek(null);
              }}
            >
              Latest
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
