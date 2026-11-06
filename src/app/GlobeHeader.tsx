import { StillNotice } from "./StillNotice";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { FeedSnapshot } from "./feed";
import type { FeedStatus } from "./feedStatus";
import type { RampName } from "../globe/ramp";
import { Utilities } from "./Utilities";
import { FeedDot } from "./FeedDot";

interface Props {
  notice: string | null;
  download: (() => void) | null;
  dismiss: () => void;
  ready: boolean;
  observing: boolean;
  onHome: () => void;
  onReset: () => void;
  headShown: boolean;
  chromeFloats: boolean;
  setHeadOpen: Dispatch<SetStateAction<boolean>>;
  snapshot: Pick<FeedSnapshot, "coveredSince" | "stats" | "archive">;
  flat: boolean;
  setFlat: Dispatch<SetStateAction<boolean>>;
  ramp: RampName;
  setRamp: Dispatch<SetStateAction<RampName>>;
  sound: boolean;
  setSound: Dispatch<SetStateAction<boolean>>;
  tourAt: number | null;
  startTour: () => void;
  stopTour: () => void;
  tourButton: RefObject<HTMLButtonElement>;
  tourDisabled: boolean;
  saving: boolean;
  saveStill: () => void;
  feeds: FeedStatus;
}

export function GlobeHeader({
  notice,
  download,
  dismiss,
  observing,
  ready,
  onHome,
  onReset,
  headShown,
  chromeFloats,
  setHeadOpen,
  snapshot,
  flat,
  setFlat,
  ramp,
  setRamp,
  sound,
  setSound,
  tourAt,
  startTour,
  stopTour,
  tourButton,
  tourDisabled,
  saving,
  saveStill,
  feeds,
}: Props): JSX.Element {
  return (
    <>
      <header
        id="chrome-head"
        className={`zone-head flex items-center gap-6 px-5 py-3 xl:border-b xl:border-hairline ${observing ? "observatory-header" : ""}`}
        hidden={!headShown}
      >
        <button
          type="button"
          onClick={onHome}
          aria-label="Everything Is Fine, back to the Observatory"
          className="wordmark flex min-h-11 cursor-pointer items-center whitespace-nowrap max-md:self-start"
        >
          Everything is fine<span aria-hidden="true">.</span>
        </button>
        {/* These ignore the filters, so each has to say whose number it is: at magnitude 4 the headline read
            5 while this row read 160. Wide screens only - from `sm` up they took ~380px of a 768px header. */}
        <div
          className={`${observing ? "!hidden" : ""} hidden items-baseline gap-5 ${snapshot.coveredSince === null ? "" : "2xl:flex"}`}
        >
          {(
            [
              ["reported", snapshot.stats.quakes.toLocaleString("en-GB")],
              ["seen by both", snapshot.stats.corroborated.toLocaleString("en-GB")],
              ...(snapshot.stats.revised > 0
                ? [["revised", snapshot.stats.revised.toLocaleString("en-GB")] as const]
                : []),
            ] as const
          ).map(([k, v]) => (
            <span key={k} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-ink tabular-nums">{v}</span>
              <span className="text-[11px] text-faint">{k}</span>
            </span>
          ))}
          <span className="text-[11px] text-faint">
            USGS{" "}
            <span className="font-mono text-[10.5px] tabular-nums">
              {snapshot.stats.readings.usgs.toLocaleString("en-GB")}
            </span>
            {" · EMSC "}
            <span className="font-mono text-[10.5px] tabular-nums">
              {snapshot.stats.readings.emsc.toLocaleString("en-GB")}
            </span>{" "}
            readings
          </span>
        </div>
        {observing ? (
          <div className="observatory-header-actions">
            <FeedDot feeds={feeds} archiveFrom={snapshot.archive?.from ?? null} />
            <button
              type="button"
              id="capture-still"
              onClick={saveStill}
              disabled={saving || !ready}
              aria-label={saving ? "Saving view" : "Save view"}
              className="observatory-save"
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8" cy="8" r="1.5" />
                <path d="m3 17 5-5 4 4 4-6 5 7" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            {/* Never `whitespace-nowrap` here. It does not shrink, it overflows, and one extra button pushed
        the header 120px past a phone viewport. */}
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 max-md:gap-x-1">
              <button
                type="button"
                id="view-projection"
                onClick={() => setFlat((f) => !f)}
                aria-pressed={flat}
                className="min-w-[60px] shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink max-md:min-w-[52px]"
              >
                {flat ? "Globe" : "Map"}
              </button>
              <button
                type="button"
                onClick={() => setRamp((r) => (r === "thermal" ? "cividis" : "thermal"))}
                aria-pressed={ramp === "cividis"}
                className={`shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised ${
                  ramp === "cividis" ? "bg-raised text-ink" : "text-faint"
                }`}
              >
                <span className="lg:hidden">Palette</span>
                <span className="hidden lg:inline">Colourblind ramp {ramp === "cividis" ? "on" : "off"}</span>
              </button>
              <Utilities>
                <button
                  type="button"
                  onClick={() => setSound((on) => !on)}
                  aria-pressed={sound}
                  className={`shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised hover:text-ink ${
                    sound ? "bg-raised text-ink" : "text-faint"
                  }`}
                >
                  {sound ? "Sound on" : "Sound off"}
                </button>
                {!tourDisabled ? (
                  <button
                    ref={tourButton}
                    type="button"
                    onClick={() => (tourAt === null ? startTour() : stopTour())}
                    aria-pressed={tourAt !== null}
                    className={`shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors hover:bg-raised hover:text-ink ${
                      tourAt !== null ? "bg-raised text-ink" : "text-faint"
                    }`}
                  >
                    {tourAt !== null ? "Stop" : "Tour"}
                  </button>
                ) : null}
                <button
                  id="capture-still"
                  type="button"
                  onClick={saveStill}
                  disabled={saving}
                  className="shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-default"
                >
                  {saving ? "Saving…" : "Save view"}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="cursor-pointer border border-hairline px-2.5 py-1 text-[11px] text-faint transition-colors hover:bg-raised hover:text-ink"
                >
                  Reset view
                </button>
                {/* Keep the fold inside the overflow. As a button of its own at 390 it wrapped onto a line by
          itself and took the header from 46px to 80px, which is the opposite of folding the bar. */}
                {chromeFloats ? null : (
                  <button
                    type="button"
                    onClick={() => setHeadOpen(false)}
                    aria-expanded={true}
                    aria-controls="chrome-head"
                    className="shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink"
                  >
                    Hide bar
                  </button>
                )}
              </Utilities>
              <FeedDot compact feeds={feeds} archiveFrom={snapshot.archive?.from ?? null} />
            </div>
          </>
        )}
        <StillNotice message={notice} download={download} dismiss={dismiss} />
      </header>

      {/* The way back. The fold control goes with the bar, so the unfold cannot live there. */}
      {headShown ? null : (
        <button
          type="button"
          id="show-top-bar"
          onClick={() => setHeadOpen(true)}
          aria-label="Show the top bar"
          aria-expanded={false}
          aria-controls="chrome-head"
          className="absolute top-3 right-4 z-[3] cursor-pointer bg-deck/60 px-2.5 py-2 font-mono
            text-[15px] leading-none text-dim backdrop-blur-xl backdrop-saturate-50
            transition-colors hover:text-ink"
        >
          &#8964;
        </button>
      )}
    </>
  );
}
