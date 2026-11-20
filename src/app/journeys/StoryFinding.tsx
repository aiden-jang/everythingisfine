import { useLayoutEffect, useRef, type ReactNode } from "react";
import { storyObservationTime } from "../layerTime";
import { storyFindings } from "./findings";
import { findingTitles } from "./findingTitles";
import { useStoryNavigation } from "./StoryNavigation";

const datedFindings = new Set(["tonga", "katrina", "kilauea", "iceberg", "aral", "megaflash"]);

export function StoryFinding({
  id,
  completed,
  children,
}: {
  id: string;
  completed: boolean;
  children?: ReactNode;
}) {
  const navigation = useStoryNavigation();
  const finding = storyFindings[id];
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const title = heading.current;
    const reading = title?.closest<HTMLElement>("#observatory-intro");
    if (!completed || !title || !reading) return;
    const focus = document.activeElement;
    if (focus !== reading && reading.contains(focus) && !focus?.closest(".story-milestones")) return;
    if (focus?.closest(".story-milestones")) title.focus({ preventScroll: true });
    const inset = 10;
    reading.scrollBy({
      top: title.getBoundingClientRect().top - reading.getBoundingClientRect().top - inset,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [completed, id]);
  if (!completed || !finding) return null;
  const held = navigation?.current()?.position.moment;
  const time = datedFindings.has(id) && held?.id === id && held.at !== undefined ? held.at : null;
  return (
    <section className="story-finding" aria-label="What this view showed">
      <h3 ref={heading} tabIndex={-1}>
        {findingTitles[id] ?? "What this view showed"}
      </h3>
      <p>{finding}</p>
      {time !== null && (
        <p className="finding-time">
          {id === "aral" ? "Annual classification · " : "Held at "}
          <time dateTime={id === "aral" ? storyObservationTime(id, time) : new Date(time).toISOString()}>
            {storyObservationTime(id, time)}
          </time>
        </p>
      )}
      {children}
      {navigation?.returnLabel && (
        <button type="button" onClick={() => navigation.returnToBrowse()}>
          Return to your place
        </button>
      )}
    </section>
  );
}
