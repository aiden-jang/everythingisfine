import { useEffect } from "react";
import { reportAnalytics } from "../../../analytics/browser";

export function useJourneyAnalytics(active: string | null) {
  useEffect(() => {
    if (!active) return;
    reportAnalytics({ name: "story_opened", story: active });
    let played = false;
    let visible = 0;
    let since = document.hidden ? null : performance.now();
    const visibility = () => {
      if (since !== null) visible += performance.now() - since;
      since = document.hidden ? null : performance.now();
    };
    const playback = (event: Event) => {
      if (
        played ||
        !(event.target instanceof Element) ||
        !event.target.closest('[data-playback-start="true"]')
      )
        return;
      played = true;
      reportAnalytics({ name: "playback_started", story: active });
    };
    document.addEventListener("click", playback, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("click", playback, true);
      document.removeEventListener("visibilitychange", visibility);
      if (since !== null) visible += performance.now() - since;
      if (visible < 5000) reportAnalytics({ name: "story_left_early", story: active });
    };
  }, [active]);
}
