import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RadarScan } from "../../sources/radar";
import { radarRegions, regionCamera, strongestRegion, type RadarRegion, type RadarView } from "./radarCamera";
import { useRadarLightning } from "./useRadarLightning";
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

export function RadarStage({
  onView,
  initialRegion,
}: {
  onView: (view: RadarView) => void;
  initialRegion?: string | undefined;
}): JSX.Element {
  const id = useId();
  const held = useRef<RadarScan | null>(null);
  const { scans, images, status, checkedAt, retry } = useRadarScans(held);
  const [chosen, setChosen] = useState<RadarScan | null>(null);
  const [showLightning, setShowLightning] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [regionId, setRegionId] = useState(initialRegion ?? "auto");
  const [focus, setFocus] = useState<RadarRegion | null | undefined>();
  const latest = scans.at(-1);
  const latestImage = latest && images.get(latest.id);
  const candidate = chosen && scans.findIndex(({ at }) => at === chosen.at);
  const index = candidate !== null && candidate >= 0 ? candidate : Math.max(0, scans.length - 1);
  const selected = scans[index];
  const image = selected && images.get(selected.id);
  const region = regionId === "auto" ? (focus ?? undefined) : radarRegions.find(({ id }) => id === regionId);
  const target = useMemo(() => regionCamera(region), [region]);

  const lightning = useRadarLightning(showLightning ? selected?.at : undefined);
  useLayoutEffect(
    () => onView({ kind: "radar", target, image: image ?? null, lightning: lightning?.frame ?? undefined }),
    [image, lightning, onView, target],
  );

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

  const place = region?.name ?? "National view";
  const delayed = latest !== undefined && checkedAt - latest.at > 20 * 60_000;
  const lastAvailable =
    status === "error" || status === "empty" ? scans.filter(({ id }) => images.get(id)).at(-1) : undefined;
  const statusText =
    status === "loading"
      ? "Loading NOAA radar scans…"
      : status === "empty"
        ? "No recent radar scans available."
        : status === "error"
          ? "Couldn’t reach NOAA radar."
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
    <div>
      <div className="radar-reading">
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
        <p role="status">
          {lastAvailable ? (
            <>
              Showing the last available radar scans. Latest available scan{" "}
              <time dateTime={new Date(lastAvailable.at).toISOString()}>{label(lastAvailable.at)}</time>.
              {image === null && " This scan’s image is unavailable."}
            </>
          ) : (
            statusText
          )}
        </p>
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
        <div className="observatory-actions radar-actions">
          <button type="button" disabled={scans.length < 2} onClick={togglePlay}>
            {playing ? "Pause" : "Play scans"}
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              setPlaying(false);
              seek(null);
            }}
          >
            Latest
          </button>
          {scans[0] && latest && (
            <span className="radar-window">
              {shortTime(scans[0].at)}–{shortTime(latest.at)} UTC
            </span>
          )}
        </div>
        <div className="observatory-actions radar-actions">
          <button
            type="button"
            aria-pressed={showLightning}
            disabled={!selected}
            onClick={() => setShowLightning((on) => !on)}
          >
            Lightning
          </button>
          {showLightning && selected && (
            <p role="status">
              {lightning === undefined
                ? "Checking GOES-East…"
                : lightning.failed
                  ? "Couldn’t load lightning data."
                  : !lightning.frame
                    ? "No lightning scan matches this radar time."
                    : `GOES-East · ${lightning.frame.measurements?.[0]?.value ?? "Unknown"} detections · ${shortTime(lightning.frame.at)} UTC`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
