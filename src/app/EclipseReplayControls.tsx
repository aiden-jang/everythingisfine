import { APRIL_ECLIPSE_END, APRIL_ECLIPSE_START } from "../geo/aprilEclipse";
import { eclipseClock, pathFraction } from "./eclipseReplay";
import type { useEclipsePlayback } from "./useEclipsePlayback";

const MINUTES = (APRIL_ECLIPSE_END - APRIL_ECLIPSE_START) / 60_000;

export function EclipseReplayControls({
  playback: { frame, panel, playing, progress, close, seek, toggle },
}: {
  playback: ReturnType<typeof useEclipsePlayback>;
}): JSX.Element | null {
  if (!frame) return null;
  const minute = Math.round(pathFraction(progress) * MINUTES);
  const instant = new Date(Math.round(frame.at)).toISOString();
  const clock = eclipseClock(frame.at);
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Eclipse replay"
      className="pointer-events-auto w-full max-w-[26rem] border border-hairline bg-deck px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="pt-0.5">
          <h2 className="text-sm font-semibold text-ink">Chase an eclipse</h2>
          <p className="text-xs text-dim">8 April 2024 · total solar eclipse</p>
        </div>
        <button
          type="button"
          aria-label="Close eclipse replay"
          onClick={() => close(true)}
          className="grid size-11 shrink-0 cursor-pointer place-items-center text-dim hover:bg-raised hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <time dateTime={instant} className="font-mono text-sm text-ink tabular-nums">
          {clock}
        </time>
        <a
          href="https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2024Apr08Tpath.html"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-dim underline underline-offset-2 hover:text-ink"
        >
          NASA path data
        </a>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="min-h-11 min-w-[4.5rem] cursor-pointer border border-hairline px-2 text-xs text-ink hover:bg-raised"
        >
          {playing ? "Pause" : progress === 1 ? "Replay" : "Play"}
        </button>
        <input
          type="range"
          aria-label="Eclipse time"
          aria-valuetext={clock}
          min={0}
          max={MINUTES}
          value={minute}
          onChange={(event) => seek(Number(event.currentTarget.value) / MINUTES)}
          onKeyDown={(event) => {
            let next: number;
            switch (event.key) {
              case "Home":
                next = 0;
                break;
              case "End":
                next = MINUTES;
                break;
              case "ArrowRight":
              case "ArrowUp":
                next = Math.min(MINUTES, minute + 1);
                break;
              case "ArrowLeft":
              case "ArrowDown":
                next = Math.max(0, minute - 1);
                break;
              default:
                return;
            }
            // A native range emits no change when the key hits the current value.
            event.preventDefault();
            seek(next / MINUTES);
          }}
          className="scrub-slider min-h-11 min-w-0 flex-1"
        />
      </div>
    </section>
  );
}
