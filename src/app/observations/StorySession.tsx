import { createContext, useContext, useRef, useState } from "react";
import type { StoryMoment } from "./storyMoment";
import { storyShare } from "./storyShare";

export interface StorySessionValue {
  shared?: boolean;
  initial: StoryMoment | undefined;
  remember: (part: Partial<StoryMoment>) => void;
  current: () => StoryMoment | undefined;
}

export const StorySession = createContext<StorySessionValue | null>(null);

export function useStorySession() {
  const session = useContext(StorySession);
  const initial = useRef(session?.initial);
  return { initial: initial.current, shared: session?.shared ?? false, remember: session?.remember };
}

export function ShareMoment({
  current,
  label = "Share this moment",
  share = storyShare,
}: {
  current?: () => StoryMoment | undefined;
  label?: string;
  share?: typeof storyShare;
} = {}): JSX.Element | null {
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
          const payload = share(moment, window.location.href);
          setStatus("");
          setFallback("");
          try {
            if (navigator.canShare?.(payload)) {
              try {
                await navigator.share(payload);
                setFallback("");
                setStatus("Moment shared. It opens paused at this moment.");
                return;
              } catch (error) {
                if (error instanceof Error && error.name === "AbortError") return;
              }
            }
            await navigator.clipboard.writeText(payload.url);
            setFallback("");
            setStatus("Link copied. It opens paused at this moment.");
          } catch {
            setFallback(payload.url);
            setStatus("Copy the link below.");
          }
        }}
      >
        {label}
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
