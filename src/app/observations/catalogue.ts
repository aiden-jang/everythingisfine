export const observations = {
  orbit: {
    title: "Orbital Pass",
    group: "After Dark",
    description: "Trace the International Space Station and find a predicted pass over your city.",
    source: "CelesTrak",
    url: "https://celestrak.org/NORAD/elements/",
  },
  drifter: {
    title: "Current Rider",
    group: "Recorded journeys",
    description: "Ride a drifting buoy’s recorded path as an ocean eddy draws it into a loop.",
    source: "NOAA Global Drifter Program",
    url: "https://www.aoml.noaa.gov/global-drifter-program/",
  },
  smoke: {
    title: "Smoke Crossing",
    group: "Recorded journeys",
    description:
      "Follow the June 2023 Canadian wildfire plume as it moves across the northeastern United States.",
    source: "NOAA GOES-East",
    url: "https://www.weather.gov/bgm/pastNonPrecipJune05072023",
  },
  tsunami: {
    title: "Tsunami Arrival",
    group: "Recorded journeys",
    description:
      "Follow the 2010 Chile tsunami across the Pacific and check the readings from open-ocean buoys.",
    source: "NOAA tsunami research",
    url: "https://nctr.pmel.noaa.gov/chile20100227/",
  },
  rain: {
    title: "Rainbelt",
    group: "Recent observations",
    description: "Watch rain move across land and ocean in NASA’s half-hourly satellite estimates.",
    source: "NASA GPM IMERG",
    url: "https://gpm.nasa.gov/data/visualization/worldview",
  },
  tide: {
    title: "Tide Watch",
    group: "Recent observations",
    description: "Fly into a harbor and compare the observed water level with the predicted tide.",
    source: "NOAA Tides & Currents",
    url: "https://api.tidesandcurrents.noaa.gov/api/dev",
  },
  lightning: {
    title: "Lightning Live",
    group: "Recent observations",
    description: "Watch the latest satellite-detected flashes over storms.",
    source: "NOAA GOES-East GLM",
    url: "https://www.star.nesdis.noaa.gov/goes/",
  },
  wind: {
    title: "Wind Atlas",
    group: "Recent observations",
    description: "See the winds bend around weather systems from the surface to the jet stream.",
    source: "NOAA Global Forecast System",
    url: "https://www.nco.ncep.noaa.gov/pmb/products/gfs/",
  },
  river: {
    title: "River Pulse",
    group: "Recent observations",
    description: "Compare the latest flow at two gauges along the same river.",
    source: "USGS Water Data",
    url: "https://api.waterdata.usgs.gov/",
  },
  air: {
    title: "Air Watch",
    group: "Recent observations",
    description: "Inspect measured fine-particle concentrations at monitors near a city.",
    source: "EPA AirNow",
    url: "https://www.airnow.gov/about-the-data/",
  },
} as const;

export type ObservationId = keyof typeof observations;
