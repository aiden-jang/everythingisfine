import data from "./kilauea.json";

export const { bounds, sharedCoast, formerCoast, land, vent, fissures, snapshots, overflight } = data;
export const LAST = snapshots.length - 1;
export const OCEAN_ENTRY = snapshots.findIndex(({ at }) => at.startsWith("2018-06-04T22:00"));
export const COAST_COMPARISON = 48;
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "Pacific/Honolulu",
});

export function mapDate(at: string) {
  return `${dateFormat.format(new Date(at))} · ${at.slice(11, 16)} HST`;
}
