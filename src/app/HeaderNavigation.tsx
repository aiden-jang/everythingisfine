import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { SavedBoundary, SavedPanel } from "./visitor/SavedBoundary";
import "./header-navigation.css";
import "./visitor/saved-collection.css";

const loadCollection = () => import("./visitor/SavedCollection");
const warmCollection = () => {
  void loadCollection().catch(() => {});
};
const SavedCollection = lazy(() => loadCollection().then((module) => ({ default: module.SavedCollection })));

export function HeaderNavigation({ exploring }: { exploring: boolean }) {
  const navigation = useStoryNavigation();
  const [opened, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setSaved(false), [navigation?.active, navigation?.browsingStories]);
  if (!navigation) return null;
  const saved = opened || !!navigation.restoredCollection;
  const close = () => {
    navigation.dismissRestoration();
    setSaved(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <button
        type="button"
        className="header-navigation-action header-explore"
        aria-label="Explore"
        aria-current={exploring ? "location" : undefined}
        aria-description="Open Layers and Stories, or return to your previous Explore view"
        onClick={() => {
          setSaved(false);
          navigation.dismissRestoration();
          navigation.explore();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
        </svg>
        <span>Explore</span>
      </button>
      <button
        type="button"
        className="header-navigation-action header-find"
        aria-label="Find a story"
        onClick={() => {
          setSaved(false);
          navigation.dismissRestoration();
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
        onPointerEnter={warmCollection}
        onFocus={warmCollection}
        onClick={() => (saved ? close() : setSaved(true))}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 3h12v18l-6-4-6 4Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>Saved</span>
      </button>
      {saved && (
        <SavedPanel count={navigation.library.saved.length} onClose={close}>
          <SavedBoundary>
            <Suspense
              fallback={
                <div className="saved-pending" role="status">
                  Opening saved readings…
                </div>
              }
            >
              <SavedCollection onClose={close} />
            </Suspense>
          </SavedBoundary>
        </SavedPanel>
      )}
    </>
  );
}
