import { useMemo, useSyncExternalStore, type RefObject } from "react";
import { place } from "./format";
import { NEARBY_KM } from "./nearby";
import type { SequenceRun } from "./sequenceReplay";
import type { useEventInspection } from "./useEventInspection";

const BINS = 72;
const SCALE = 1000;

function ReplayStrip({ run }: { run: SequenceRun }): JSX.Element {
  const span = run.last - run.first;
  const x = (time: number) => (span === 0 ? 50 : ((time - run.first) / span) * 100);
  const path = useMemo(() => {
    const bins = new Array<number>(BINS).fill(0);
    for (const { reading } of run.events) {
      const index =
        span === 0 ? BINS / 2 : Math.min(BINS - 1, Math.floor(((reading.time - run.first) / span) * BINS));
      bins[index]! += 1;
    }
    const max = Math.sqrt(Math.max(...bins));
    return bins
      .flatMap((count, i) =>
        count === 0 ? [] : [`M${((i + 0.5) / BINS) * 100},16v${-Math.max(3, (Math.sqrt(count) / max) * 15)}`],
      )
      .join(" ");
  }, [run, span]);

  return (
    <div className="pointer-events-none absolute inset-x-0 inset-y-2" aria-hidden="true">
      <svg
        className="absolute inset-0 h-full w-full text-dim"
        viewBox="0 0 100 17"
        preserveAspectRatio="none"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="absolute inset-y-0 w-px bg-[#ffd18a]" style={{ left: `${x(run.pin.time)}%` }} />
    </div>
  );
}

function SequenceTransport({
  run,
  panel,
  close,
}: {
  run: SequenceRun;
  panel: RefObject<HTMLElement>;
  close: (restoreFocus?: boolean) => void;
}): JSX.Element {
  const state = useSyncExternalStore(run.subscribe, run.read);
  const iso = new Date(Math.round(state.at)).toISOString();
  const clock = `${iso.slice(0, 10)} · ${iso.slice(11, 19)} UTC`;
  const span = run.last - run.first;
  const value = span > 0 ? Math.round(((state.at - run.first) / span) * SCALE) : 0;
  const seek = (step: number) => run.seek(run.first + (step / SCALE) * span);
  const phase = state.done
    ? "Full sequence"
    : state.shown === 0
      ? "Framing region"
      : state.at < run.pin.time
        ? "Earlier events"
        : state.at === run.pin.time
          ? `Pinned quake · M ${run.pin.magnitude.toFixed(1)}`
          : "Later events";
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Sequence replay"
      className="pointer-events-auto w-full max-w-[27rem] border border-hairline bg-deck px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-0.5">
          <h2 className="text-sm font-semibold text-ink">Sequence replay</h2>
          <p className="truncate text-xs text-dim">{place(run.pin.place)}</p>
        </div>
        <button
          type="button"
          aria-label="Close sequence replay"
          onClick={() => close(true)}
          className="grid size-11 shrink-0 cursor-pointer place-items-center text-dim hover:bg-raised hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <time className="font-mono text-ink tabular-nums" dateTime={iso}>
          {clock}
        </time>
        <span className="text-dim">
          {state.shown} / {run.events.length} events
        </span>
      </div>
      <div className="relative mt-2 h-11 border-b border-hairline">
        <ReplayStrip run={run} />
        {span > 0 && (
          <input
            type="range"
            min={0}
            max={SCALE}
            value={value}
            className="timeline-slider absolute inset-0 h-full w-full"
            aria-label="Sequence time"
            aria-valuetext={clock}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              let next: number;
              switch (event.key) {
                case "Home":
                  next = 0;
                  break;
                case "End":
                  next = SCALE;
                  break;
                case "ArrowRight":
                case "ArrowUp":
                  next = Math.min(SCALE, value + 1);
                  break;
                case "ArrowLeft":
                case "ArrowDown":
                  next = Math.max(0, value - 1);
                  break;
                default:
                  return;
              }
              event.preventDefault();
              seek(next);
            }}
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-dim">
          <span aria-live="polite" className="block text-ink">
            {phase}
          </span>
          Recorded events within {NEARBY_KM} km
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
    </section>
  );
}

export function SequenceReplayControls({
  replay: { run, panel, close },
}: {
  replay: ReturnType<typeof useEventInspection>;
}): JSX.Element | null {
  return run?.kind === "sequence" ? <SequenceTransport run={run} panel={panel} close={close} /> : null;
}
