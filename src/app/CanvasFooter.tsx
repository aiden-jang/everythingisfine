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
    <div
      className="relative order-2 flex w-full flex-wrap items-end gap-x-6 gap-y-2
              md:justify-center md:max-xl:flex-col md:max-xl:items-start"
    >
      <p className="creator-credit py-1.5 text-[11px] text-faint xl:absolute xl:bottom-0 xl:left-0">
        made by{" "}
        <a
          href="https://www.aidenjang.com"
          target="_blank"
          aria-describedby="external-link-hint"
          rel="noreferrer"
          // Inline-flex lets the mobile minimum height apply to the link.
          className="pointer-events-auto inline-flex items-center text-faint underline decoration-from-font underline-offset-2 transition-colors hover:text-dim max-md:min-h-11"
        >
          aiden jang
        </a>
      </p>
      <div className="key-hints pointer-events-auto md:max-xl:order-first bg-deck/40 px-2.5 py-1.5 font-mono text-[10.5px] text-faint backdrop-blur-xl backdrop-saturate-50">
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
    </div>
  );
}

export function RadarCanvasCredit({ radar }: { radar: RadarLayerView | null }): JSX.Element | null {
  return radar ? (
    <p className="radar-canvas-credit">
      <a
        href="https://www.rainviewer.com/"
        target="_blank"
        rel="noreferrer"
        aria-describedby="external-link-hint"
      >
        Weather data by RainViewer
      </a>
      {radar.at !== undefined && (
        <time dateTime={new Date(radar.at).toISOString()}>Radar · {layerTime(radar.at)}</time>
      )}
    </p>
  ) : null;
}
