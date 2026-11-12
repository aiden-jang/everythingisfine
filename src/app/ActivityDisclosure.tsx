import type { ReactNode } from "react";

export function ActivityDisclosure({
  open,
  onOpen,
  headline,
  children,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  headline: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="activity-disclosure" aria-label="Earthquake activity">
      <div className="activity-heading">
        {headline}
        <button
          type="button"
          id="earthquake-activity-toggle"
          aria-expanded={open}
          aria-controls="earthquake-activity-content"
          aria-label="Earthquake reports"
          onClick={() => onOpen(!open)}
        >
          <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
            <path d="m2 2 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div id="earthquake-activity-content" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
