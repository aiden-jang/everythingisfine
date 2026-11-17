import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { SavedBoundary, SavedFallback } from "./visitor/SavedBoundary";
import "./header-navigation.css";
import "./visitor/saved-collection.css";

const SavedCollection = lazy(() =>
  import("./visitor/SavedCollection").then((module) => ({ default: module.SavedCollection })),
);

export function HeaderNavigation() {
  const navigation = useStoryNavigation();
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setSaved(false), [navigation?.active, navigation?.browsingStories]);
  if (!navigation) return null;
  const close = () => {
    setSaved(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <button
        type="button"
        className="header-navigation-action header-explore"
        aria-description="Open Layers and Stories, or return to your previous Explore view"
        onClick={() => {
          setSaved(false);
          navigation.explore();
        }}
      >
        <span>Explore</span>
      </button>
      <button
        type="button"
        className="header-navigation-action header-find"
        aria-label="Find a story"
        onClick={() => {
          setSaved(false);
          navigation.browse(true);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m15 15 6 6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>Find</span>
      </button>
      <button
        ref={trigger}
        id="open-saved-observations"
        type="button"
        className="header-navigation-action"
        aria-label="Saved observations and recent visits"
        aria-expanded={saved}
        aria-controls={saved ? "saved-observations" : undefined}
        onClick={() => setSaved((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 3h12v18l-6-4-6 4Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>Saved</span>
      </button>
      {saved && (
        <SavedBoundary onClose={close}>
          <Suspense
            fallback={
              <SavedFallback onClose={close}>
                <p role="status">Opening your saved observations…</p>
                <button type="button" onClick={close}>
                  Back to the world
                </button>
              </SavedFallback>
            }
          >
            <SavedCollection onClose={close} />
          </Suspense>
        </SavedBoundary>
      )}
    </>
  );
}
