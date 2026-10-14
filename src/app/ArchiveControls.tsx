import { NOTABLE_DAYS, NOTABLE_NOTE } from "./notableDays";
import { ECLIPSE_DAYS, eclipseMoment } from "./eclipseDays";
import { isArchivableDay, typedDay } from "./day";
import type { FeedSnapshot } from "./feed";
import type { useArchive } from "./useArchive";

interface Props {
  archive: FeedSnapshot["archive"];
  state: ReturnType<typeof useArchive>;
  onCursor: (at: number) => void;
}

export function ArchiveControls({ archive, state, onCursor }: Props): JSX.Element {
  const {
    archiveDay,
    setArchiveDay,
    earlyDay,
    dayFault,
    archiveBusy,
    archiveNote,
    loadedDay,
    newestDay,
    neighbours,
    dayCounts,
    askCounts,
    loadArchive,
    stepDay,
    backToLive,
  } = state;
  return (
    <div data-rail="activity" aria-busy={archiveBusy}>
      {archive ? (
        <div className="stamp mb-3 bg-raised p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="label">Archive</span>
            <button
              type="button"
              onClick={backToLive}
              className="cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-deck hover:text-ink"
            >
              back to live
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink">
            {new Date(archive.from).toISOString().slice(0, 10)}, all day UTC. Nothing here is arriving now.
          </p>
          {/* Disabled while a day is in flight: two archive loads race, and the second answer is not
                necessarily the second request. */}
          {neighbours ? (
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                disabled={archiveBusy}
                onClick={() => stepDay(-1)}
                className="cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-deck hover:text-ink disabled:cursor-default disabled:text-faint"
              >
                ‹ {neighbours.prev}
              </button>
              <button
                type="button"
                disabled={archiveBusy || neighbours.next > newestDay}
                onClick={() => stepDay(1)}
                className="cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-deck hover:text-ink disabled:cursor-default disabled:text-faint"
              >
                {neighbours.next} ›
              </button>
            </div>
          ) : null}
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Storms, fires, floods and volcanoes come from NASA rather than the live feeds. No aurora: it is a
            forecast, so there is no past to ask for.
          </p>
          {archiveNote ? (
            <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-faint">{archiveNote}</p>
          ) : null}
        </div>
      ) : (
        /* Label above, not beside: side by side left the date field 60px in the 768px strip. */
        <div className="mb-3">
          <label className="label" htmlFor="archive-day">
            Go to a day
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            {/* ISO text, not `type="date"`: the native widget wants `mm/dd/yyyy`, which this app never prints,
                so a day could not be copied out of the list below and pasted in. */}
            <input
              id="archive-day"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="YYYY-MM-DD"
              aria-invalid={dayFault ? true : undefined}
              aria-describedby={dayFault ? "archive-day-fault" : undefined}
              value={archiveDay}
              onChange={(e) => setArchiveDay(typedDay(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !archiveBusy && isArchivableDay(archiveDay, Date.now())) {
                  e.preventDefault();
                  void loadArchive(archiveDay);
                }
              }}
              className="min-w-0 flex-1 border border-hairline bg-transparent px-1.5 py-1 font-mono text-[10.5px] text-dim placeholder:text-faint"
            />
            <span className="relative inline-flex size-[26px] shrink-0 items-center justify-center border border-hairline text-faint hover:text-ink">
              <svg viewBox="0 0 14 14" aria-hidden="true" className="size-[11px]">
                <rect
                  x="1"
                  y="2.5"
                  width="12"
                  height="10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path d="M1 6 H13 M4.5 1 V4 M9.5 1 V4" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <input
                type="date"
                aria-label="Pick a day from a calendar"
                max={newestDay}
                value={isArchivableDay(archiveDay, Date.now()) ? archiveDay : ""}
                onChange={(e) => {
                  const picked = e.target.value;
                  if (!picked) return;
                  setArchiveDay(picked);
                  if (isArchivableDay(picked, Date.now())) void loadArchive(picked);
                }}
                /* `showPicker` throws where it is unsupported, and the browser's own icon is invisible here. */
                onClick={(e) => {
                  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                  try {
                    el.showPicker?.();
                  } catch {
                    /* the field still takes a typed date */
                  }
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </span>
            <button
              type="button"
              disabled={archiveBusy || !isArchivableDay(archiveDay, Date.now())}
              onClick={() => void loadArchive(archiveDay)}
              className="shrink-0 cursor-pointer border border-hairline px-2 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:cursor-default disabled:text-faint"
            >
              {archiveBusy ? "loading…" : "go"}
            </button>
          </div>
          {/* Said here, not through `archiveNote`: that renders in the other branch of this ternary, so a
                day refused while live set a message nobody ever saw. */}
          {dayFault ? (
            <p id="archive-day-fault" className="mt-1 text-[11px] leading-relaxed text-faint">
              {dayFault}
            </p>
          ) : (
            /* The field takes any day that has ended, which includes the one anybody actually wants
                     and would never think to try. One sentence, because the control for it already
                     exists: a second field beside this one was the same field twice. */
            <p className="mt-1 text-[11px] leading-relaxed text-faint">
              {earlyDay
                ? "Before about 1970 only the large ones were recorded anywhere. A quiet day back" +
                  " there may mean nobody was listening, not that the Earth was still."
                : "Any day that has ended, including the one you were born on."}
            </p>
          )}
        </div>
      )}
      {archiveNote && !archive ? (
        <p role="status" className="mt-1 text-[11px] text-faint">
          {archiveNote}
        </p>
      ) : null}
      {/* Outside the archived/live branch: inside it the list vanished the moment a day loaded, so going
                from one notable day to another meant going back to live and waiting for the feeds. */}
      <details
        className="mt-2"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) askCounts();
        }}
      >
        <summary className="disclose text-[11px] text-faint hover:text-dim">Days worth seeing</summary>
        <div className="mt-1">
          {NOTABLE_DAYS.map((d) => (
            <button
              key={d.day}
              type="button"
              disabled={archiveBusy}
              onClick={() => {
                setArchiveDay(d.day);
                void loadArchive(d.day);
              }}
              aria-label={
                `${d.what}, magnitude ${d.magnitude}, ${d.day}` +
                (typeof dayCounts[d.day] === "number"
                  ? `, ${dayCounts[d.day]!.toLocaleString("en-GB")} events`
                  : "")
              }
              aria-current={loadedDay === d.day ? "true" : undefined}
              className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2 rounded-[2px] px-1 py-1 text-left transition-colors hover:bg-raised disabled:cursor-default ${
                loadedDay === d.day ? "bg-raised" : ""
              }`}
            >
              <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">{d.day}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{d.what}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">
                M{d.magnitude.toFixed(1)}
              </span>
              <span className="w-[38px] shrink-0 text-right font-mono text-[10.5px] text-faint tabular-nums">
                {dayCounts[d.day] === undefined || dayCounts[d.day] === null
                  ? ""
                  : dayCounts[d.day]!.toLocaleString("en-GB")}
              </span>
            </button>
          ))}
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{NOTABLE_NOTE}</p>
        </div>
      </details>
      {/* Sets the cursor as well as the day: a shadow lasts a few hours and an archived day opens at its
                right edge, so loading only the day lands after the thing the row names. The times are checked
                against the geometry in `eclipseDays.test.ts`, because a wrong minute fails silently. */}
      <details className="mt-2">
        <summary className="disclose text-[11px] text-faint hover:text-dim">Eclipses</summary>
        <div className="mt-1">
          {ECLIPSE_DAYS.map((e) => (
            <button
              key={e.day}
              type="button"
              disabled={archiveBusy}
              onClick={() => {
                setArchiveDay(e.day);
                void loadArchive(e.day);
                onCursor(eclipseMoment(e));
              }}
              aria-label={`${e.what}, ${e.kind} eclipse, ${e.day} at ${e.at} UTC`}
              aria-current={loadedDay === e.day ? "true" : undefined}
              className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2 rounded-[2px] px-1 py-1 text-left text-[11px] transition-colors hover:bg-raised disabled:cursor-default ${
                loadedDay === e.day ? "bg-raised text-ink" : "text-faint"
              }`}
            >
              <span className="w-[62px] shrink-0 font-mono text-[10.5px] tabular-nums">
                {e.day.slice(0, 7)}
              </span>
              <span className="grow">{e.what}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
