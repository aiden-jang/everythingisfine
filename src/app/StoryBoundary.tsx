import { Component, createRef, type ReactNode } from "react";
import { ObservationCredit } from "./observations/ObservationCredit";

export class StoryBoundary extends Component<
  {
    children: ReactNode;
    onClose: () => void;
    closeLabel: string;
    resetKey: string;
  },
  { failed: boolean }
> {
  state = { failed: false };
  panel = createRef<HTMLElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.panel.current?.focus({ preventScroll: true });
  }

  componentDidUpdate(previous: Readonly<StoryBoundary["props"]>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="observatory-sidebar">
        <section
          ref={this.panel}
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
          <h2>This view couldn’t open.</h2>
          <p role="alert">
            A part of the story failed to load. You can return to exploring or reload this page.
          </p>
          <div className="observatory-actions">
            <button type="button" onClick={this.props.onClose}>
              {this.props.closeLabel}
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </section>
        <ObservationCredit />
      </div>
    );
  }
}
