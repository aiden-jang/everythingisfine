import { useContext, useState } from "react";
import { StorySession } from "./StorySession";

export function StoryDeparture() {
  const place = useContext(StorySession)?.departure;
  const [visible, setVisible] = useState(true);
  if (!place || !visible) return null;
  return (
    <div
      className="recorded-anchors story-departure"
      aria-hidden="true"
      onAnimationEnd={() => setVisible(false)}
    >
      <span data-observation-anchor="" data-lon={place.lon} data-lat={place.lat}>
        From {place.label}
      </span>
    </div>
  );
}
