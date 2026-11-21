import { layerTime } from "./layerTime";
import { stillMoment } from "./still";
import type { RadarLayerView } from "./radar/radarCamera";

export function CanvasStamp({ cursor, day }: { cursor: number | null; day: number | null }) {
  return cursor !== null || day !== null ? (
    <div className="stamp pointer-events-none absolute bottom-4 left-4 z-[2] bg-deck/40 px-3 py-2 font-mono text-[11px] text-faint backdrop-blur-xl backdrop-saturate-50">
      {stillMoment(cursor, day ?? Date.now(), day !== null)}
    </div>
  ) : null;
}

export function KeyboardHelp({
  flat,
  playing,
  archived,
  clearable,
}: {
  flat: boolean;
  playing: boolean;
  archived: boolean;
  clearable: boolean;
}) {
  const shortcuts = [
    ["Arrows", flat ? "Pan the map" : "Orbit the globe"],
    ["+ / −", "Zoom"],
    ["0", "Reset camera"],
    ["Space", playing ? "Pause playback" : "Start playback"],
    [", / .", "Step through time"],
    ...(archived ? [["[ / ]", "Change archive day"]] : []),
    ...(flat ? [["Shift + drag", "Draw a cross-section"]] : []),
    ["F", "Fullscreen"],
    ...(clearable ? [["Esc", "Clear the current selection"]] : []),
  ];
  return (
    <details className="view-keyboard-help">
      <summary>Keyboard shortcuts</summary>
      <dl className="keyboard-controls">
        {shortcuts.map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function RadarCanvasCredit({ radar }: { radar: RadarLayerView | null }): JSX.Element | null {
  const scan = radar?.at === undefined ? undefined : new Date(radar.at).toISOString();
  return radar ? (
    <p className="radar-canvas-credit">
      <span className="radar-canvas-time">
        <span aria-hidden="true">Radar · 00:00 UTC</span>
        {scan && radar.at !== undefined ? (
          <time dateTime={scan} title={layerTime(radar.at)}>
            Radar · {scan.slice(11, 16)} UTC
          </time>
        ) : (
          <span>Radar · No scan</span>
        )}
      </span>
      <span aria-hidden="true">·</span>
      <a
        href="https://www.rainviewer.com/"
        target="_blank"
        rel="noreferrer"
        aria-label="Radar by RainViewer"
        aria-describedby="external-link-hint"
      >
        <span className="radar-credit-prefix">Radar by </span>RainViewer
      </a>
    </p>
  ) : null;
}
