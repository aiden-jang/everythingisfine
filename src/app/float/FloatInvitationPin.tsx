import { createPortal } from "react-dom";
import { useLayoutEffect } from "react";
import { refreshAnnotations } from "../../globe/annotationInput";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { firstFloatProfile } from "./firstProfile";

export function FloatInvitationPin() {
  const navigation = useStoryNavigation();
  const stage = document.querySelector(".zones");
  useLayoutEffect(() => refreshAnnotations(), [stage]);
  if (!stage || !navigation) return null;
  return createPortal(
    <div className="float-invitation-location">
      <button
        type="button"
        data-observation-anchor=""
        data-lon={firstFloatProfile.lon}
        data-lat={firstFloatProfile.lat}
        disabled={!!navigation.unavailable("float")}
        onClick={() => navigation.open("float", "start-story")}
        aria-label="Follow Float Dive at this location"
      >
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeOpacity="0.35" />
          <circle cx="14" cy="14" r="3" fill="currentColor" />
        </svg>
        <span>
          Float Dive<small>Recorded Argo profile</small>
        </span>
      </button>
    </div>,
    stage,
  );
}
