import { Component, type ReactNode } from "react";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { searchStories } from "./storyIndex";

export function StoryBoundary({
  children,
  resetKey,
  onHome,
}: {
  children: ReactNode;
  resetKey: string;
  onHome: () => void;
}) {
  const navigation = useStoryNavigation();
  return (
    <StoryFallback
      resetKey={resetKey}
      story={searchStories.find(({ id }) => id === navigation?.active)}
      closeLabel={navigation?.returnLabel ?? "Back to home"}
      onClose={() => {
        if (!navigation?.returnToBrowse()) onHome();
      }}
    >
      {children}
    </StoryFallback>
  );
}

function recoverStoryDownload(error: Error, story: string) {
  if (
    !/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(
      error.message,
    ) ||
    new URLSearchParams(window.location.hash.slice(1)).get("story") !== story
  )
    return;
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  if (!entry) return;
  const key = `eif.story-reload:${entry}:${story}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
  window.location.reload();
}

class StoryFallback extends Component<
  {
    children: ReactNode;
    onClose: () => void;
    closeLabel: string;
    resetKey: string;
    story: { id: string; title: string } | undefined;
  },
  { failed: boolean }
> {
  state = { failed: false };
  focusPanel = (panel: HTMLElement | null) => panel?.focus({ preventScroll: true });

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    if (this.props.story) recoverStoryDownload(error, this.props.story.id);
  }

  componentDidUpdate(previous: Readonly<StoryFallback["props"]>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="observatory-sidebar">
        <section
          ref={this.focusPanel}
          tabIndex={-1}
          className="observatory-intro story-unavailable"
          aria-label="Story unavailable"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            this.props.onClose();
          }}
        >
          <h2>
            {this.props.story ? `Couldn’t open ${this.props.story.title}.` : "This view couldn’t open."}
          </h2>
          <p role="alert">Try opening this view again, or go back to where you were exploring.</p>
          <div className="observatory-actions">
            <button type="button" onClick={this.props.onClose}>
              {this.props.closeLabel}
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </section>
      </div>
    );
  }
}
