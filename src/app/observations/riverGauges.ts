export const riverBasins = [
  {
    id: "hudson",
    label: "Hudson River · New York",
    stations: [
      { id: "01327750", label: "Fort Edward" },
      { id: "01358000", label: "Green Island" },
    ],
  },
  {
    id: "potomac",
    label: "Potomac River · Mid-Atlantic",
    stations: [
      { id: "01613000", label: "Hancock" },
      { id: "01646500", label: "Little Falls" },
    ],
  },
  {
    id: "colorado",
    label: "Colorado River · Grand Canyon",
    stations: [
      { id: "09380000", label: "Lees Ferry" },
      { id: "09402500", label: "Grand Canyon" },
    ],
  },
] as const;

export const riverUnit = "ft³/s";
export const gaugeUrl = (id: string) => `https://waterdata.usgs.gov/monitoring-location/USGS-${id}/`;
export const riverGauge = (id: string) =>
  riverBasins.flatMap(({ stations }) => [...stations]).find((station) => station.id === id);
export const discharge = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${riverUnit}`;
