import type { ObservatoryProps } from "./Observatory";

export function ObservatoryTourControls({
  tour,
  onExplore,
}: Pick<ObservatoryProps, "tour" | "onExplore">): JSX.Element {
  return (
    <div className="observatory-tour-controls">
      <div className="observatory-tour-step">
        <button
          type="button"
          onClick={tour.previous}
          disabled={tour.at === 0}
          aria-label="Previous tour stop"
        >
          ←
        </button>
        <button type="button" onClick={tour.pause}>
          {tour.paused ? "Resume tour" : "Pause tour"}
        </button>
        <button
          type="button"
          onClick={tour.next}
          aria-label={(tour.at ?? 0) + 1 >= tour.length ? "Finish tour" : "Next tour stop"}
        >
          →
        </button>
      </div>
      <div className="observatory-actions">
        <button type="button" ref={tour.button} onClick={tour.stopTour}>
          Stop
        </button>
        {tour.inspect ? (
          <button type="button" onClick={tour.inspect}>
            Read this event ↗
          </button>
        ) : (
          <button type="button" onClick={onExplore}>
            Explore this view ↗
          </button>
        )}
      </div>
    </div>
  );
}
