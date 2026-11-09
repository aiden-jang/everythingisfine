export const earthStories = {
  fault: {
    title: "Fault Offset",
    summary: "Trace Ridgecrest’s 2019 ruptures and inspect measured offsets.",
    location: "Mojave Desert · July 2019",
    scene: "depth",
    source: "USGS field surveys",
    url: "https://doi.org/10.5066/P9BZ5IJ9",
    note: "Mapped surface ruptures and field measurements. The reveal orders the two earthquakes; it does not reconstruct rupture speed. Horizontal offsets are local measurements, not slip everywhere along a fault. Radar colors wrap every 11.45 cm of line-of-sight change (ALOS-2 product metadata); they combine movement between 16 April 2018 and 8 July 2019.",
  },
  dust: {
    title: "Dust Curtain",
    summary: "Cross the Atlantic with the June 2020 dust plume and open a lidar slice.",
    location: "Atlantic Ocean · June 2020",
    scene: "live",
    source: "NASA AIRS / CALIPSO",
    url: "https://science.nasa.gov/earth/earth-observatory/a-dust-plume-to-remember-146913/",
    note: "AIRS dust score identifies an infrared dust signature, not particle concentration. The CALIPSO curtain shows measured 532 nm backscatter near the Caribbean on 23 June, approximately 06:46–06:51 UTC. Height is exaggerated 80×; the ground track interpolates the published axis coordinates. Clouds also scatter the laser. Unobserved areas remain transparent.",
  },
  comet: {
    title: "Comet Return",
    summary: "Follow NEOWISE through July 2020, then find it above your city.",
    location: "C/2020 F3 · July 2020",
    scene: "night",
    source: "NASA / JPL Horizons",
    url: "https://ssd.jpl.nasa.gov/horizons/",
    note: "Computed geocentric positions from JPL Horizons, sampled hourly. The globe shows the point directly beneath the comet’s direction, not a ground track. The sky marker is enlarged for identification; visibility depends on twilight, weather and light pollution.",
  },
  fire: {
    title: "Fire Front",
    summary: "Reveal the 2021 Dixie region’s fire detections, satellite pass by satellite pass.",
    location: "Northern Sierra Nevada · 2021",
    scene: "live",
    source: "NASA FIRMS · Suomi-NPP VIIRS",
    url: "https://firms.modaps.eosdis.nasa.gov/",
    note: "Nominal/high-confidence VIIRS thermal detections in the Dixie region. Points are detected heat, not exact ignition times, burned area or a continuous fire perimeter. Nearby fires can appear in this geographic window. Missing detections do not establish that a fire stopped.",
  },
  ice: {
    title: "Ice Line",
    summary: "Scrub the Arctic’s daily retreat toward the 2012 summer minimum.",
    location: "Arctic Ocean · March–September 2012",
    scene: "live",
    source: "NOAA / NSIDC Sea Ice Index v4",
    url: "https://nsidc.org/data/g02135/versions/4",
    note: "Daily sea-ice extent at the 15% concentration threshold, on a nominal 25 km grid. Extent includes water within those cells; it is not ice thickness. The outline and chart compare the same calendar dates with the 1981–2010 reference.",
  },
  north: {
    title: "Wandering North",
    summary: "Follow the magnetic dip pole and see how your city’s compass changes.",
    location: "Magnetic north · 1900–2025",
    scene: "live",
    source: "NOAA / IAGA IGRF",
    url: "https://www.ncei.noaa.gov/products/wandering-geomagnetic-poles",
    note: "Modelled magnetic dip-pole positions, sampled yearly. City declination is calculated with IGRF-14 at sea level. Magnetic north differs from geographic north; local magnetic anomalies are not included. This is an educational view, not a navigation instrument.",
  },
  ozone: {
    title: "Ozone Season",
    summary: "Watch Antarctic ozone change and compare matching dates in two seasons.",
    location: "Antarctica · 2006 and 2019",
    scene: "live",
    source: "NASA Aura OMI / Ozone Watch",
    url: "https://ozonewatch.gsfc.nasa.gov/meteorology/SH.html",
    note: "Total-column ozone in Dobson units. The ozone hole is the region below 220 DU south of 40°S. Blank areas are missing observations. Two seasons illustrate variability; they do not establish a long-term trend.",
  },
  water: {
    title: "Water Weight",
    summary: "Follow California’s changing water storage through drought and wetter months.",
    location: "California · 2011–2017",
    scene: "live",
    source: "NASA / JPL GRACE mascons",
    url: "https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/",
    note: "Monthly total water-storage anomalies relative to 2004–2009, in centimetres of equivalent water thickness. Includes snow, soil, surface water and groundwater. Regional values average land cells in the displayed box. Effective resolution is roughly 3°, not individual reservoirs. Missing months are skipped.",
  },
} as const;

export type EarthStoryId = keyof typeof earthStories;
export const earthStoryIds = Object.keys(earthStories) as EarthStoryId[];
export function isEarthStory(id: string): id is EarthStoryId {
  return Object.hasOwn(earthStories, id);
}
