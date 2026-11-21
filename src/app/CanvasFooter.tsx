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

export function CanvasFooter({
  flat,
  playing,
  archived,
  clearable,
}: {
  flat: boolean;
  playing: boolean;
  archived: boolean;
  clearable: boolean;
}): JSX.Element {
  return (
    <div className="canvas-footer">
      <KeyboardHelp flat={flat} playing={playing} archived={archived} clearable={clearable} />
    </div>
  );
}

export function KeyboardHelp({
  flat,
  playing,
  archived,
  clearable,
  mobile = false,
}: {
  flat: boolean;
  playing: boolean;
  archived: boolean;
  clearable: boolean;
  mobile?: boolean;
}) {
  return (
    <details className={mobile ? "mobile-key-hints" : "key-hints pointer-events-auto text-faint"}>
      <summary>Keyboard controls</summary>
      <div className="keyboard-controls">
        {/* What the keys do in this projection: a row saying orbit while the drag pans is worse than none. */}
        {(
          [
            ["arrows", flat ? "pan" : "orbit"],
            ["+ -", "zoom"],
            ["0", "reset"],
            ["space", playing ? "pause" : "play"],
            [", .", "step"],
            ...(archived ? [["[ ]", "day"] as const] : []),
            ...(flat ? [["shift-drag", "section"] as const] : []),
            ["f", "full"],
            /* Only when there is something to clear, or the app offers `esc` on every first load. `markId`
                belongs in this list and in the ladder: a mark card is a pin. */
            ...(clearable ? [["esc", "clear"] as const] : []),
          ] as const
        ).map(([key, what]) => (
          <span key={key} className="mr-3 inline-flex items-baseline gap-1.5">
            <span className="text-dim">{key}</span>
            {what}
          </span>
        ))}
      </div>
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
