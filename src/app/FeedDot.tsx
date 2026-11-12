import { useEffect, useId, useRef, type JSX } from "react";
import { layerTime } from "./layerTime";
import type { FeedStatus, FeedRow } from "./feedStatus";
import { observations } from "./observations/catalogue";
import "./feed-status.css";

const LABEL: Record<FeedRow["state"], string> = {
  ok: "Available",
  pending: "Loading",
  failed: "Couldn’t reach feed",
  off: "Off",
};

export function FeedDot({
  feeds,
  archiveFrom,
  compact = false,
}: {
  feeds: FeedStatus;
  archiveFrom: number | null;
  compact?: boolean;
}): JSX.Element {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || !panel.current) return;
    panel.current.style.setProperty(
      "--feed-top",
      `${Math.max(12, Math.min(Math.ceil(rect.bottom + 6), window.innerHeight - 100))}px`,
    );
    panel.current.style.setProperty("--feed-offset", `${window.innerWidth - rect.right}px`);
  };
  useEffect(() => {
    const move = () => {
      if (panel.current?.matches(":popover-open")) position();
    };
    window.addEventListener("resize", move);
    return () => window.removeEventListener("resize", move);
  }, []);
  if (archiveFrom !== null)
    return (
      <span className="font-mono text-[11px] text-dim">
        {new Date(archiveFrom).toISOString().slice(0, 10)}
      </span>
    );
  const dot = feeds.arrived === feeds.total ? "bg-ink" : "bg-dim";
  const unavailable = feeds.rows.filter(({ state }) => state === "failed").length;
  const pending = feeds.total - feeds.arrived - unavailable;
  return (
    <>
      <button
        type="button"
        className="feed-toggle"
        data-feed-compact={compact || undefined}
        ref={trigger}
        {...{ popovertarget: id }}
        aria-controls={id}
        onClick={position}
      >
        <span className={`inline-block size-[6px] rounded-full ${dot}`} aria-hidden="true" />
        <span className="sr-only">Feed status,</span>
        <span className="feed-wide hidden sm:inline">{feeds.phrase}</span>
        <span className="feed-count sm:hidden">
          <span>
            {feeds.arrived}/{feeds.total}
          </span>
          <span className="sr-only">
            {feeds.arrived === 0 && feeds.settling ? "connecting" : "available"}
          </span>
        </span>
        <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
          <path d="m1 1 3.5 3.5L8 1" stroke="currentColor" />
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        {...{ popover: "auto" }}
        data-feed-popover=""
        className="feed-popover"
        role="region"
        aria-labelledby={`${id}-title`}
      >
        <h2 id={`${id}-title`}>Background feed status</h2>
        <p>
          {pending > 0
            ? `Checking ${pending} of ${feeds.total} background feeds…`
            : `${feeds.total} background feeds checked.`}
          {unavailable > 0 && ` ${unavailable} unavailable.`}
        </p>
        <ul>
          {feeds.rows.map(({ id: key, label, state, lastCheck, message }) => (
            <li key={key}>
              <strong>{label}</strong>
              <span>{message ?? LABEL[state]}</span>
              {lastCheck !== undefined && (
                <small>
                  Last successful check{" "}
                  <time
                    dateTime={new Date(lastCheck).toISOString()}
                    title={new Date(lastCheck).toISOString()}
                  >
                    {layerTime(lastCheck)}
                  </time>
                </small>
              )}
            </li>
          ))}
        </ul>
        <p>
          Enabled weather layers join the total on the landing globe and in Explore. They pause in other
          views. Off means they are not being checked. These are source counts, not visible layer counts:
          earthquakes use two sources, and event sources keep checking when their markers are hidden.
        </p>
        <h3>Loads when opened</h3>
        <p>
          Float Dive, Sun Watch and other observatory views check their own sources when opened. Find the full
          catalogue in All stories &amp; data.
        </p>
        <details>
          <summary>Other observatory views</summary>
          <p>
            {Object.values(observations)
              .map(({ title }) => title)
              .join(" · ")}
          </p>
        </details>
      </div>
    </>
  );
}
