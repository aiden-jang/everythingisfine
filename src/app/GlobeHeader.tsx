import { ClipNotice } from "./capture/ClipControls";
import type { Clip } from "./capture/useClip";
import { ObservatoryOptions } from "./ObservatoryOptions";
import { StillNotice } from "./StillNotice";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import type { FeedSnapshot } from "./feed";
import type { FeedStatus } from "./feedStatus";
import { FeedDot } from "./FeedDot";
import { refreshAnnotations } from "../globe/annotationInput";

interface Props {
  clip: Clip;
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
  saving: boolean;
  saveStill: () => void;
  feeds: FeedStatus;
  keyboard: ReactNode;
  rotation: { enabled: boolean; set: (enabled: boolean) => void };
}

export function GlobeHeader({
  clip,
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
  saving,
  saveStill,
  feeds,
  rotation,
  keyboard,
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
        <div className="observatory-header-actions">
          {!observing && (
            <div className="projection-switch" role="group" aria-label="Projection" data-flat={flat}>
              <span className="projection-current" aria-current="true">
                {flat ? "Map" : "Globe"}
              </span>
              <button
                type="button"
                id="view-projection"
                className="observatory-save"
                onClick={() => setFlat((value) => !value)}
                aria-description={flat ? "Switch to globe" : "Switch to map"}
              >
                {flat ? "Globe" : "Map"}
              </button>
            </div>
          )}
          <FeedDot compact={!observing} feeds={feeds} archiveFrom={snapshot.archive?.from ?? null} />
          <ObservatoryOptions
            clip={clip}
            ready={ready}
            saving={saving}
            saveStill={saveStill}
            rotation={rotation}
          >
            {!observing && (
              <>
                {keyboard}
                <button
                  type="button"
                  onClick={() => refreshAnnotations({ camera: "reset" })}
                  aria-description="Recenter the camera without changing layers, filters or time"
                >
                  Reset camera
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  aria-description="Reset the camera and earthquake filters, and return to live"
                >
                  {snapshot.archive ? "Reset to live" : "Reset view & filters"}
                </button>
                {!chromeFloats && (
                  <button
                    type="button"
                    onClick={() => setHeadOpen(false)}
                    aria-expanded={true}
                    aria-controls="chrome-head"
                  >
                    Hide bar
                  </button>
                )}
              </>
            )}
          </ObservatoryOptions>
        </div>
        <StillNotice message={notice} download={download} dismiss={dismiss} />
      </header>

      <ClipNotice clip={clip} />

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
