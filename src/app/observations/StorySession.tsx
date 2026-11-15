import { createContext, useContext, useRef, useState } from "react";
import type { StoryMoment } from "./storyMoment";
import { storyShare } from "./storyShare";

export interface StorySessionValue {
  initial: StoryMoment | undefined;
  remember: (part: Partial<StoryMoment>) => void;
  current: () => StoryMoment | undefined;
}

export const StorySession = createContext<StorySessionValue | null>(null);

export function useStorySession() {
  const session = useContext(StorySession);
  const initial = useRef(session?.initial);
  return { initial: initial.current, remember: session?.remember };
}

export function ShareMoment({
  current,
}: { current?: () => StoryMoment | undefined } = {}): JSX.Element | null {
  const session = useContext(StorySession);
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState("");
  const read = current ?? session?.current;
  if (!read) return null;
  return (
    <div className="story-share">
      <button
        type="button"
        onClick={async () => {
          const moment = read();
          if (!moment) return;
          const share = storyShare(moment, window.location.href);
          setStatus("");
          setFallback("");
          try {
            if (navigator.canShare?.(share)) {
              try {
                await navigator.share(share);
                setFallback("");
                setStatus("Moment shared. It opens paused at this moment.");
                return;
              } catch (error) {
                if (error instanceof Error && error.name === "AbortError") return;
              }
            }
            await navigator.clipboard.writeText(share.url);
            setFallback("");
            setStatus("Link copied. It opens paused at this moment.");
          } catch {
            setFallback(share.url);
            setStatus("Copy the link below.");
          }
        }}
      >
        Share this moment
      </button>
      <span role="status" aria-label="Sharing status">
        {status}
      </span>
      {fallback && (
        <input
          aria-label="Story link"
          value={fallback}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
