// International Meteor Organization, 2026 and 2027 Meteor Shower Calendars, working lists and peak nights.
export const meteorCalendar = [
  { name: "Northern Taurids", day: "2026-11-11", ra: 58, dec: 22 },
  { name: "Leonids", day: "2026-11-16", ra: 152, dec: 22 },
  { name: "Geminids", day: "2026-12-13", ra: 112, dec: 33 },
  { name: "Ursids", day: "2026-12-21", ra: 217, dec: 76 },
  { name: "Quadrantids", day: "2027-01-03", ra: 230, dec: 49 },
  { name: "Lyrids", day: "2027-04-21", ra: 271, dec: 34 },
  { name: "Eta Aquariids", day: "2027-05-05", ra: 338, dec: -1 },
  { name: "Southern Delta Aquariids", day: "2027-07-30", ra: 340, dec: -16 },
  { name: "Perseids", day: "2027-08-12", ra: 48, dec: 58 },
  { name: "Orionids", day: "2027-10-21", ra: 95, dec: 16 },
  { name: "Leonids", day: "2027-11-17", ra: 152, dec: 22 },
  { name: "Geminids", day: "2027-12-14", ra: 112, dec: 33 },
  { name: "Ursids", day: "2027-12-22", ra: 217, dec: 76 },
] as const;

export type MeteorShower = (typeof meteorCalendar)[number];

export function nextMeteor(now: number): MeteorShower | undefined {
  return meteorCalendar.find(({ day }) => now < Date.parse(day) + 36 * 3_600_000);
}

export const meteorDate = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
