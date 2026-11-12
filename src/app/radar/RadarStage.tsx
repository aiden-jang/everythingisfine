import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RadarScan } from "../../sources/radar";
import {
  radarRegions,
  globalRadarRegions,
  radarCamera,
  regionCamera,
  strongestRegion,
  type RadarRegion,
  type RadarView,
} from "./radarCamera";
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
  initialAt,
  global,
}: {
  onView: (view: RadarView) => void;
  initialRegion?: string | undefined;
  initialAt?: number | undefined;
  global: boolean;
}): JSX.Element {
  const id = useId();
  const held = useRef<RadarScan | null>(null);
  const { scans, images, status, checkedAt, retry } = useRadarScans(held, global);
  const [chosen, setChosen] = useState<RadarScan | null>(null);
  const [showLightning, setShowLightning] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [regionId, setRegionId] = useState(initialRegion ?? (global ? "world" : "auto"));
  const [focus, setFocus] = useState<RadarRegion | null | undefined>();
  const latest = scans.at(-1);
  const latestImage = latest && images.get(latest.id);
  const [restored, setRestored] = useState(initialAt === undefined);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (restored || status !== "ready") return;
    const saved = scans.find(({ at }) => at === initialAt);
    if (saved) {
      held.current = saved;
      setChosen(saved);
    } else setExpired(true);
    setRestored(true);
  }, [restored, status, scans, initialAt]);
  const candidate = chosen && scans.findIndex(({ at }) => at === chosen.at);
  const index = candidate !== null && candidate >= 0 ? candidate : Math.max(0, scans.length - 1);
  const selected = scans[index];
  const image = selected && images.get(selected.id);
  const region = regionId === "auto" ? (focus ?? undefined) : radarRegions.find(({ id }) => id === regionId);
  const target = useMemo(
    () => (global ? radarCamera(regionId) : regionCamera(region)),
    [region, regionId, global],
  );

  const lightning = useRadarLightning(showLightning ? selected?.at : undefined);
  useLayoutEffect(
    () =>
      onView({
        kind: "radar",
        region: regionId,
        target,
        image: image ?? null,
        at: image ? selected?.at : undefined,
        lightning: lightning?.frame ?? undefined,
      }),
    [image, lightning, onView, target, selected?.at, regionId],
  );

  function seek(scan: RadarScan | null) {
    held.current = scan;
    setChosen(scan);
  }

  useEffect(() => {
    if (global || !latestImage || focus !== undefined) return;
    setFocus(strongestRegion(latestImage) ?? null);
  }, [focus, latestImage, global]);

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

  const place = global
    ? (globalRadarRegions.find(({ id }) => id === regionId)?.name ?? "World")
    : (region?.name ?? "National view");
  const provider = global ? "RainViewer" : "NOAA";
  const delayed = latest !== undefined && checkedAt - latest.at > 20 * 60_000;
  const lastAvailable =
    status === "error" || status === "empty" ? scans.filter(({ id }) => images.get(id)).at(-1) : undefined;
  const statusText =
    status === "loading"
      ? `Loading ${provider} radar scans…`
      : status === "empty"
        ? "No recent radar scans available."
        : status === "error"
          ? `Couldn’t reach ${provider} radar.`
          : image === null
            ? "This scan’s image is unavailable."
            : image === undefined
              ? "Loading the selected scan…"
              : delayed
                ? `${provider}’s latest scan is delayed.`
                : regionId === "auto" && region
                  ? "Automatic focus · area with visible returns"
                  : "Select a time to compare the observed scans.";
  const canRetry = status === "error" || status === "empty" || image === null;
  const atLatest = index === scans.length - 1 && chosen === null;
  const timeLabel = selected ? label(selected.at) : "Waiting for scans";

  const problem = !!lastAvailable || canRetry || image === undefined || delayed;
  const statusMessage = (
    <>
      {lastAvailable ? (
        <>
          Showing the last available radar scans. Latest available scan{" "}
          <time dateTime={new Date(lastAvailable.at).toISOString()}>{label(lastAvailable.at)}</time>.
          {image === null && " This scan’s image is unavailable."}
        </>
      ) : (
        statusText
      )}
    </>
  );

  function togglePlay() {
    if (!playing && index === scans.length - 1) seek(scans[0] ?? null);
    setPlaying(!playing);
  }

  return (
    <div className="radar-stage-controls">
      {expired && (
        <p role="status" aria-label="Saved radar scan status">
          The saved scan has expired. Showing the latest available scan.
        </p>
      )}
      <div className="radar-transport">
        <div className="radar-clock">
          <label htmlFor={id}>
            {global ? (atLatest ? "Latest frame" : "Frame time") : atLatest ? "Latest scan" : "Scan time"}
          </label>
          {selected && <time dateTime={new Date(selected.at).toISOString()}>{timeLabel}</time>}
        </div>
        {problem && (
          <p className="radar-warning" role="status" aria-label="Radar status">
            {statusMessage}
          </p>
        )}
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
        <div className="observatory-actions radar-actions radar-playback">
          <button
            type="button"
            aria-label="Previous radar scan"
            disabled={index === 0 || scans.length < 2}
            onClick={() => {
              setPlaying(false);
              seek(scans[index - 1] ?? null);
            }}
          >
            Previous
          </button>
          <button
            data-playback-start={!playing || undefined}
            type="button"
            disabled={scans.length < 2}
            onClick={togglePlay}
          >
            {playing ? "Pause" : "Play scans"}
          </button>
          <button
            type="button"
            aria-label="Next radar scan"
            disabled={index >= scans.length - 1 || scans.length < 2}
            onClick={() => {
              setPlaying(false);
              seek(scans[index + 1] ?? null);
            }}
          >
            Next
          </button>
        </div>
        <div className="observatory-actions radar-actions">
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
          {!global && (
            <button
              type="button"
              aria-pressed={showLightning}
              disabled={!selected}
              onClick={() => setShowLightning((on) => !on)}
            >
              Lightning
            </button>
          )}
          {showLightning && selected && (
            <p role="status" aria-label="Lightning status">
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
      <div className="radar-reading">
        <div className="radar-place">
          <h3>{place}</h3>
          <label>
            <span className="sr-only">Radar region</span>
            <select value={regionId} onChange={(event) => setRegionId(event.currentTarget.value)}>
              {!global && <option value="auto">Auto focus</option>}
              {!global && <option value="national">United States</option>}
              {(global ? globalRadarRegions : radarRegions).map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!problem && (
          <p role="status" aria-label="Radar status">
            {statusMessage}
          </p>
        )}
        {canRetry && (
          <button type="button" className="radar-retry" onClick={retry}>
            Retry {provider}
          </button>
        )}
      </div>
    </div>
  );
}
