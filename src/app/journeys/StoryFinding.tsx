import { useLayoutEffect, useRef } from "react";
import { layerTime } from "../layerTime";
import { revealReading } from "../observations/revealReading";
import { storyFindings } from "./findings";
import { findingTitles } from "./findingTitles";
import { useStoryNavigation } from "./StoryNavigation";

const datedFindings = new Set(["tonga", "katrina", "kilauea", "iceberg", "aral", "megaflash"]);

export function StoryFinding({ id, completed }: { id: string; completed: boolean }) {
  const navigation = useStoryNavigation();
  const finding = storyFindings[id];
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const reading = heading.current?.closest("#observatory-intro");
    if (completed && !reading?.contains(document.activeElement)) revealReading(heading.current);
  }, [completed, id]);
  if (!completed || !finding) return null;
  const held = navigation?.current()?.position.moment;
  const time = datedFindings.has(id) && held?.id === id && held.at !== undefined ? held.at : null;
  return (
    <section className="story-finding" aria-label="What this view showed">
      <h3 ref={heading}>{findingTitles[id] ?? "What this view showed"}</h3>
      <p>{finding}</p>
      {time !== null && (
        <p className="finding-time">
          Held at <time dateTime={new Date(time).toISOString()}>{layerTime(time)}</time>
        </p>
      )}
      {navigation?.returnLabel && (
        <button type="button" onClick={() => navigation.returnToBrowse()}>
          Return to your place
        </button>
      )}
    </section>
  );
}
