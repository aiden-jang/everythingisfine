import { storyKind } from "../storyBrowse";
import type { Visit } from "./library";

export function visitAction(visit: Visit): "Continue" | "Watch again" | "Open latest" {
  const kind = storyKind(visit.id);
  if (visit.id === "epic" && visit.position.moment?.choice !== "latest")
    return visit.completed ? "Watch again" : "Continue";
  if (kind === "Recent observations" || kind === "Forecast" || ["sky", "meteors", "orbit"].includes(visit.id))
    return "Open latest";
  return visit.completed ? "Watch again" : "Continue";
}

export function restartVisit(visit: Visit): Visit {
  const { sky, float, radar, moment } = visit.position;
  return {
    id: visit.id,
    seen: visit.seen,
    position: {
      ...(moment
        ? {
            moment: {
              id: moment.id,
              map: moment.map,
              ...(moment.choice ? { choice: moment.choice } : {}),
              ...(moment.city ? { city: moment.city } : {}),
            },
          }
        : {}),
      ...(sky
        ? {
            sky: {
              ...sky,
              ...(sky.lunar ? { lunar: { ...sky.lunar, eva: 0, meters: 0, station: null } } : {}),
            },
          }
        : {}),
      ...(float ? { float: { ...float, index: 0 } } : {}),
      ...(radar ? { radar: { map: radar.map, ...(radar.region ? { region: radar.region } : {}) } } : {}),
    },
  };
}
