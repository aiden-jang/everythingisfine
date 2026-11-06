import type { ObservationId } from "./catalogue";
import type { ObservationSource } from "./types";

export const loadSource: Record<ObservationId, () => Promise<ObservationSource>> = {
  epic: () => import("../../sources/observations/epic").then(({ epic }) => epic),
  deep: () => import("../../sources/observations/deepTime").then(({ deepTime }) => deepTime),
  swell: () => import("../../sources/observations/swell").then(({ swell }) => swell),
  tide: () => import("../../sources/observations/water").then(({ tide }) => tide),
  river: () => import("../../sources/observations/water").then(({ river }) => river),
  rain: () => import("../../sources/observations/rain").then(({ rain }) => rain),
  orbit: () => import("../../sources/observations/orbit").then(({ orbit }) => orbit),
  drifter: () => import("../../sources/observations/drifter").then(({ drifter }) => drifter),
  wind: () => import("../../sources/observations/wind").then(({ wind }) => wind),
  air: () => import("../../sources/observations/air").then(({ air }) => air),
  lightning: () => import("../../sources/observations/lightning").then(({ lightning }) => lightning),
  smoke: () => import("../../sources/observations/archive").then(({ smoke }) => smoke),
  tsunami: () => import("../../sources/observations/archive").then(({ tsunami }) => tsunami),
};
