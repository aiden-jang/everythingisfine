import { useSyncExternalStore, type RefObject } from "react";
import { seconds } from "./arrival";
import type { WaveRun } from "./waveReplay";
import type { useWaveInspection } from "./useWaveInspection";

export function WaveReplayControls({
  replay: { run, panel, close },
}: {
  replay: ReturnType<typeof useWaveInspection>;
}): JSX.Element | null {
  return run ? <WaveTransport run={run} panel={panel} close={close} /> : null;
}

function WaveTransport({
  run,
  panel,
  close,
}: {
  run: WaveRun;
  panel: RefObject<HTMLElement>;
  close: (restoreFocus?: boolean) => void;
}): JSX.Element {
  const state = useSyncExternalStore(run.subscribe, run.read);
  const { city, km, p, s } = run.route;
  const phase = state.done ? "Both arrived" : state.at >= p ? "P wave arrived" : "Estimated travel";
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Wave replay"
      className="pointer-events-auto w-full max-w-[26rem] border border-hairline bg-deck px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-0.5">
          <h2 className="text-sm font-semibold text-ink">Follow the wave</h2>
          <p className="text-xs text-dim">
            {city.name} · {Math.round(km)} km from the epicentre
          </p>
        </div>
        <button
          type="button"
          aria-label="Close wave replay"
          onClick={() => close(true)}
          className="grid size-11 shrink-0 cursor-pointer place-items-center text-dim hover:bg-raised hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-3 border-t border-hairline pt-2 text-xs">
        <p className={state.at >= p ? "text-ink" : "text-dim"}>
          <span className="font-semibold text-[#ffd18a]">P wave</span> · {seconds(p)}
        </p>
        <p className={state.done ? "text-ink" : "text-dim"}>
          <span className="font-semibold text-[#83daff]">S wave</span> · {seconds(s)}
        </p>
      </div>
      <div className="mt-1 flex min-h-11 items-center justify-between gap-2">
        <p className="text-xs text-dim">
          <span className="font-mono text-ink tabular-nums">+{Math.round(state.at)} s</span>
          {" · "}
          <span aria-live="polite">{phase}</span>
        </p>
        {!state.reduced && (
          <button
            type="button"
            onClick={run.toggle}
            className="min-h-11 min-w-[4.5rem] cursor-pointer border border-hairline px-2 text-xs text-ink hover:bg-raised"
          >
            {state.done ? "Replay" : state.playing ? "Pause" : "Resume"}
          </button>
        )}
      </div>
      <p className="text-xs text-dim">Regional model · estimated arrivals</p>
    </section>
  );
}
