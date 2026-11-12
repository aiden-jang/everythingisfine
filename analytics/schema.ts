import { searchStories } from "../src/app/storyIndex";
import { journeys } from "../src/app/journeys/catalogue";
// Shared browser/Worker contract. Dynamic path segments never enter an event.
export const APP = "everythingisfine";
export const HOST = "everythingisfine.aidenjang.com";
export const PAGES = ["globe", "other"] as const;
export const ACTIONS = [
  "event_opened",
  "source_filter_changed",
  "replay_started",
  "share_created",
  "archive_opened",
  "explore_opened",
  "clip_created",
] as const;
export type Page = (typeof PAGES)[number];
export type AnalyticsEvent =
  | { name: "page_view"; page: Page }
  | { name: (typeof ACTIONS)[number] }
  | { name: "scene_selected"; scene: "live" | "depth" | "night" }
  | { name: "story_opened" | "playback_started" | "story_left_early"; story: string }
  | { name: "journey_started" | "journey_completed"; journey: string };
const stories = new Set(searchStories.map(({ id }) => id));
const routes = new Set(journeys.map(({ id }) => id));
const storyEvents = new Set(["story_opened", "playback_started", "story_left_early"]);

const exact: Record<string, Page> = { "/": "globe" };
const prefixes: readonly (readonly [string, Page])[] = [];
export function pageForPath(pathname: string): Page {
  const path = pathname.split(/[?#]/)[0] ?? "";
  if (Object.prototype.hasOwnProperty.call(exact, path)) return exact[path]!;
  return prefixes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "other";
}
export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event);
  if (keys.length === 2) {
    if (event.name === "scene_selected")
      return typeof event.scene === "string" && ["live", "depth", "night"].includes(event.scene);
    if (typeof event.name === "string" && storyEvents.has(event.name))
      return typeof event.story === "string" && stories.has(event.story);
    if (event.name === "journey_started" || event.name === "journey_completed")
      return typeof event.journey === "string" && routes.has(event.journey);
  }
  if (event.name === "page_view")
    return (
      keys.length === 2 &&
      keys.includes("page") &&
      typeof event.page === "string" &&
      (PAGES as readonly string[]).includes(event.page)
    );
  return (
    keys.length === 1 && typeof event.name === "string" && (ACTIONS as readonly string[]).includes(event.name)
  );
}

// Confirmed server operations cannot be fabricated through the anonymous browser endpoint.
export const BROWSER_ACTIONS: readonly string[] = [...ACTIONS];
export function isBrowserAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isAnalyticsEvent(value)) return false;
  const name = value.name;
  return (
    name === "page_view" ||
    BROWSER_ACTIONS.includes(name) ||
    name === "scene_selected" ||
    storyEvents.has(name) ||
    name === "journey_started" ||
    name === "journey_completed"
  );
}
