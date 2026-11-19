import type { Visit } from "../visitor/library";
import { timeIso } from "./tongaTimeline";

const epoch = Date.parse(timeIso(0));

export function keptPressureMinutes(saved: readonly Visit[] | undefined, station: string): number[] {
  return (
    saved?.flatMap(({ position }) => {
      const moment = position.moment;
      return moment?.id === "tonga" && moment.choice === station && moment.at !== undefined
        ? [Math.floor((moment.at - epoch) / 60_000)]
        : [];
    }) ?? []
  );
}
