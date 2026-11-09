import { createContext, useContext, useRef, useState } from "react";
import { writeStoryMoment, type StoryMoment } from "./storyMoment";

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

export function ShareMoment(): JSX.Element | null {
  const session = useContext(StorySession);
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState("");
  if (!session) return null;
  return (
    <div className="story-share">
      <button
        type="button"
        onClick={async () => {
          const moment = session.current();
          if (!moment) return;
          const url = new URL(window.location.href);
          const params = new URLSearchParams();
          writeStoryMoment(params, moment);
          url.hash = params.toString();
          try {
            await navigator.clipboard.writeText(url.href);
            setFallback("");
            setStatus("Link copied. It opens paused at this moment.");
          } catch {
            setFallback(url.href);
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
