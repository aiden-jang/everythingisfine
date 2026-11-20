import { useEffect, useId, useRef, type JSX } from "react";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { useStorySource } from "./observations/StorySourceStatus";
import { observations } from "./observations/catalogue";
import { layerTime } from "./layerTime";
import { feedSourceLinks, type FeedStatus, type FeedRow } from "./feedStatus";
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
}: {
  feeds: FeedStatus;
  archiveFrom: number | null;
}): JSX.Element {
  const active = useStoryNavigation()?.active ?? null;
  const story = useStorySource(active);
  const source = story ? observations[story.id] : null;
  const storyFailed = story?.state === "failed";
  const id = `feed-status-${useId()}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const storyHeading = useRef<HTMLHeadingElement>(null);
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
  if (archiveFrom !== null) {
    const date = new Date(archiveFrom).toISOString().slice(0, 10);
    return (
      <time className="feed-archive font-mono text-[11px]" dateTime={date} aria-label={date} title={date}>
        <span className="feed-wide">{date}</span>
        <span className="feed-count">{date.slice(5)}</span>
      </time>
    );
  }
  const unavailable = feeds.rows.filter(({ state }) => state === "failed").length;
  const state = unavailable || storyFailed ? "failed" : feeds.settling ? "pending" : "ok";
  return (
    <>
      <button
        type="button"
        className="feed-toggle"
        ref={trigger}
        {...{ popovertarget: id }}
        aria-controls={id}
        data-story-failed={storyFailed || undefined}
        onClick={position}
      >
        <span className="feed-indicator" data-state={state} aria-hidden="true" />
        <span className="sr-only">Feed status,</span>
        <span className="feed-wide">
          {storyFailed
            ? "Story source unavailable"
            : active && feeds.phrase === "All feeds available"
              ? "Background feeds available"
              : feeds.phrase}
        </span>
        <span className="feed-count">
          <span>
            {feeds.arrived}/{feeds.total}
          </span>
          <span className="sr-only">
            {" available"}
            {feeds.settling && unavailable > 0 ? `, ${unavailable} unavailable` : ""}
            {feeds.settling ? ", checking remaining feeds" : ""}
            {storyFailed && source ? `. ${source.title} source unavailable` : ""}
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
        {story && source && (
          <section className="story-source-status" aria-label={`${source.title} source`}>
            <h2 ref={storyHeading} tabIndex={-1}>
              {source.title}
            </h2>
            <p role="status">
              {source.source} ·{" "}
              {
                {
                  loading: "Checking",
                  ready: "Data loaded",
                  empty: "No readings for this selection",
                  failed: "Unavailable",
                }[story.state]
              }
            </p>
            {storyFailed && (
              <button
                type="button"
                onClick={() => {
                  storyHeading.current?.focus({ preventScroll: true });
                  story.retry();
                }}
                aria-label={`Retry ${source.title} source`}
              >
                Retry source
              </button>
            )}
          </section>
        )}
        <h2 id={`${id}-title`}>Background feed status</h2>
        <p className="feed-scope">
          {active
            ? "The count covers enabled background layers."
            : "Checks for this view. Paused and off feeds are outside the count."}
        </p>
        <ul>
          {feeds.rows.map(({ id: key, label, state, message }) => (
            <li key={key}>
              <span id={`${id}-${key}-state`} className="feed-row-state" title={LABEL[state]}>
                <span className="feed-indicator" data-state={state} aria-hidden="true" />
                <span className="sr-only">{LABEL[state]}</span>
              </span>
              <a
                href={feedSourceLinks[key]}
                target="_blank"
                rel="noreferrer"
                aria-describedby={`${id}-${key}-state external-link-hint`}
              >
                {label}
              </a>
              {state !== "ok" || message ? (
                <small className="feed-row-detail" title={message ?? LABEL[state]}>
                  {state === "failed"
                    ? "Unavailable"
                    : (message?.replace(/^Available · /, "") ?? (state === "pending" ? "Checking" : "Off"))}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
        <details>
          <summary>About these feeds</summary>
          <p>Filled dot: available. Ring: checking. Diamond: unavailable. Dash: off.</p>
          <p>Available means the source answered. Coverage varies by place and time.</p>
          <p>Stories check their own sources when opened.</p>
          <dl className="feed-check-times">
            {feeds.rows.flatMap(({ id, label, lastCheck }) =>
              lastCheck === undefined
                ? []
                : [
                    <div key={id}>
                      <dt>{label}</dt>
                      <dd>
                        <time dateTime={new Date(lastCheck).toISOString()}>{layerTime(lastCheck)}</time>
                      </dd>
                    </div>,
                  ],
            )}
          </dl>
        </details>
      </div>
    </>
  );
}
