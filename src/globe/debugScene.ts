import type { createGlobe } from "./scene";
import type { Feed } from "../app/feed";
import type { Filters } from "../data/types";
import type { Mark } from "./marks";

export function exposeScene(
  globe: ReturnType<typeof createGlobe>,
  feed: Feed,
  read: () => { filters: Filters; marks: readonly Mark[] },
  draw: () => void,
  clockAt: () => number,
): void {
  console.info("[globe] geometry", globe.stats);
  Object.assign(window, {
    __globe: globe.controls,
    __feed: feed,
    __events: globe.events,
    __rings: globe.rings,
    __slab: globe.slab,
    __marks: () => read().marks.filter((m) => m.id !== undefined),
    __hitTest: (x: number, y: number, slopPx?: number) =>
      globe.hitTest(x, y, feed.store, read().filters, clockAt(), slopPx),
    __drawOnce: draw,
  });
}
