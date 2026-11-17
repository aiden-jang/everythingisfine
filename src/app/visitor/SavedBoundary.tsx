import { Component, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function SavedFallback({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => panel.current?.querySelector("button")?.focus({ preventScroll: true }), []);
  return createPortal(
    <section
      ref={panel}
      className="saved-collection-loading"
      aria-label="Saved observations"
      id="saved-observations"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {children}
    </section>,
    document.querySelector(".frame") ?? document.body,
  );
}

export class SavedBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <SavedFallback onClose={this.props.onClose}>
        <p role="status">
          Your collection couldn’t open. This hasn’t changed your saved observations. Reload to try again.
        </p>
        <button type="button" onClick={this.props.onClose}>
          Back to the world
        </button>
        <button type="button" onClick={() => location.reload()}>
          Reload app
        </button>
      </SavedFallback>
    );
  }
}
