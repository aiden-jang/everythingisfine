import { ClipNotice } from "./capture/ClipControls";
import type { Clip } from "./capture/useClip";
import { ObservatoryOptions } from "./ObservatoryOptions";
import { StillNotice } from "./StillNotice";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import type { FeedSnapshot } from "./feed";
import type { FeedStatus } from "./feedStatus";
import { FeedDot } from "./FeedDot";
import { Wordmark } from "./Wordmark";
import { CreatorCredit } from "./CreatorCredit";
import { refreshAnnotations } from "../globe/annotationInput";
import { HeaderNavigation } from "./HeaderNavigation";
import { ProjectionSwitch } from "./ProjectionSwitch";

interface Props {
  clip: Clip;
  notice: string | null;
  download: (() => void) | null;
  dismiss: () => void;
  ready: boolean;
  observing: boolean;
  onHome: () => void;
  home: { readonly current: { lon: number; lat: number; zoom: number } };
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

export function SkipControls({ observing, railShown }: { observing: boolean; railShown: boolean }) {
  return (
    <a
      className="skip-controls"
      href={observing ? "#observatory-intro" : "#chrome-rail"}
      onClick={(event) => {
        event.preventDefault();
        document
          .querySelector<HTMLElement>(
            observing
              ? "#observatory-intro"
              : railShown
                ? "#chrome-rail"
                : "#show-top-bar, [aria-controls=chrome-rail]",
          )
          ?.focus();
      }}
    >
      Skip to controls
    </a>
  );
}

export function GlobeHeader({
  clip,
  notice,
  download,
  dismiss,
  observing,
  ready,
  onHome,
  home,
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
        <Wordmark onHome={onHome} />
        <div className="observatory-header-actions">
          <HeaderNavigation />
          {!observing && <ProjectionSwitch flat={flat} setFlat={setFlat} visible={headShown} />}
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
                  onClick={() => refreshAnnotations({ camera: "reset", home: home.current })}
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
      <CreatorCredit />

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
