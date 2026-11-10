export const onward: Record<string, readonly [string, string]> = {
  epic: ["orbit", "Compare a distant photograph with a predicted low-Earth orbit."],
  deep: ["seafloor", "Look at the present-day terrain above those moving plates."],
  swell: ["drifter", "Compare wave motion with a recorded ocean-current journey."],
  orbit: ["sky", "Find the Moon and planets above your saved city."],
  drifter: ["float", "Move from a surface track to measured water below it."],
  iceberg: ["glacier", "Compare drifting ice with satellite-measured land ice motion."],
  smoke: ["air", "See current air-quality readings; they are not readings from the 2023 smoke event."],
  tsunami: ["tide", "Compare the recorded 2010 wave with present-day harbor measurements."],
  rain: ["river", "Look at current river gauges; these are separate observations, not a flood forecast."],
  tide: ["swell", "Compare water level at a harbor with waves measured offshore."],
  lightning: ["megaflash", "Slow down a single, record-setting flash from 2017."],
  wind: ["atmospheric-river", "Follow forecast moisture transport as well as wind."],
  river: ["water", "Zoom out from a river gauge to California’s 2011–2017 water-storage record."],
  air: ["smoke", "Revisit the satellite record of the June 2023 smoke crossing."],
  seafloor: ["float", "Explore an independent Argo profile of the water above the seafloor."],
  apophis: ["comet", "Compare the predicted 2029 flyby with NEOWISE’s 2020 path."],
  glacier: ["iceberg", "Follow A-68A’s separate journey through the Southern Ocean."],
  "atmospheric-river": ["rain", "Compare forecast transport with delayed satellite rain estimates."],
  eclipse: ["shadow", "Switch from the March 2025 lunar eclipse to the August 2027 solar eclipse."],
  nino: ["reef", "Compare the 1997–1998 ocean section with coral heat-stress observations."],
  bloom: ["drifter", "Follow a recorded surface-current track through another part of the ocean."],
  reef: ["nino", "Look below the surface in the 1997–1998 tropical Pacific record."],
  aral: ["water", "Compare visible shoreline loss with a different satellite measure: water storage."],
  spring: ["bloom", "Compare seasonal land greening with the 2024 North Atlantic bloom."],
  fault: ["rupture", "Compare Ridgecrest with the larger 2011 Tōhoku rupture."],
  dust: ["smoke", "Compare two satellite records of material crossing a continent or ocean."],
  comet: ["apophis", "Follow a different orbit: Apophis’s predicted 2029 close approach."],
  fire: ["smoke", "Compare the 2021 fire detections with a separate 2023 smoke event."],
  ice: ["iceberg", "Move from regional sea-ice extent to a single Antarctic iceberg’s journey."],
  north: ["aurora", "See the current aurora forecast around the magnetic poles."],
  ozone: ["ice", "Compare two different polar records; their dates and measurements differ."],
  water: ["river", "Return to current USGS river gauges."],
  rupture: ["tsunami", "Compare Tōhoku’s fault with the separately recorded 2010 Chile tsunami."],
  katrina: ["lights", "See a different hurricane’s aftermath: Maria in Puerto Rico, 2017."],
  tonga: ["megaflash", "Explore another rapid atmospheric event through satellite detections."],
  megaflash: ["lightning", "Return to recent GOES lightning detections."],
  kilauea: ["tide", "Compare permanent coastal change with a harbor’s changing water level."],
  lights: ["katrina", "Follow an independent hurricane track: Katrina in 2005."],
  shadow: [
    "eclipse",
    "Compare the 2027 solar eclipse with the calculated geometry of the 2025 lunar eclipse.",
  ],
  sky: ["moonfall", "Leave tonight’s sky for Apollo 17’s recorded 1972 traverse."],
  moonfall: ["sky", "Return to the Moon and planets above your saved city tonight."],
  meteors: ["sky", "Check the Moon and planets in the same saved city."],
  aurora: ["sun", "Inspect solar measurements upstream; they are not an aurora guarantee."],
  sun: ["aurora", "Compare the solar measurements with NOAA’s separate aurora forecast."],
  radar: ["rain", "Compare regional radar scans with delayed satellite rainfall estimates."],
  float: ["drifter", "Compare the vertical profile with a recorded surface-current track."],
};

export interface JourneyStep {
  id: string;
  prompt: string;
  context: string;
}
export interface Journey {
  id: string;
  title: string;
  summary: string;
  ending: string;
  steps: readonly JourneyStep[];
}

export const journeys: readonly Journey[] = [
  {
    id: "above-earth",
    title: "One night above Earth",
    summary: "Your sky, the lunar surface, and a satellite passing overhead.",
    ending: "The sky changes with your city and time. Return on another night to compare it.",
    steps: [
      {
        id: "sky",
        prompt: "Pick your city and scrub the night. Find when the Moon clears the horizon.",
        context: "Calculated Moon and planet positions for the selected city and night.",
      },
      {
        id: "moonfall",
        prompt: "Descend to Taurus–Littrow, then follow the rover through the valley.",
        context: "NASA lunar terrain and Apollo 17’s December 1972 route; this is an archive, not tonight.",
      },
      {
        id: "orbit",
        prompt: "Switch to Local sky and compare the predicted ISS path with your horizon.",
        context: "A current CelesTrak orbit prediction. Visibility depends on sunlight and your location.",
      },
    ],
  },
  {
    id: "water-in-motion",
    title: "Water in motion",
    summary: "Moisture in the air, rain from orbit, and water at a river gauge.",
    ending:
      "Forecast transport, satellite estimates, and gauge readings measure different parts of the water cycle. They are not one synchronized forecast.",
    steps: [
      {
        id: "atmospheric-river",
        prompt: "Scrub the forecast and follow the strongest band of moisture toward the coast.",
        context: "NOAA GFS forecast. Check the model issue time before comparing it with observations.",
      },
      {
        id: "rain",
        prompt:
          "Play the recent rain estimates. Compare where rain appears with where moisture was forecast.",
        context: "NASA GPM satellite estimates arrive with a delay; coverage and time differ from GFS.",
      },
      {
        id: "river",
        prompt: "Choose a gauge and inspect its recorded rise or fall.",
        context:
          "USGS gauge measurements. This is a separate location and record, not proof that the forecast caused a particular rise.",
      },
    ],
  },
  {
    id: "reading-the-coast",
    title: "Reading the coast",
    summary: "New land, a passing wave, and the daily rise and fall of water.",
    ending:
      "A coastline can change permanently or appear to move with the water. These three independent records reveal the difference.",
    steps: [
      {
        id: "kilauea",
        prompt: "Follow the lava to Kapoho Bay and compare the shore before and after the flow.",
        context: "USGS flow maps from the 2018 Kīlauea eruption in Hawaiʻi.",
      },
      {
        id: "tsunami",
        prompt: "Follow the wave across the Pacific and look for its arrival in the pressure record.",
        context: "NOAA’s separate 2010 Chile tsunami record; this wave was not caused by Kīlauea.",
      },
      {
        id: "tide",
        prompt: "Choose a harbor, play the readings, and optionally listen to its measured water level.",
        context:
          "Recent NOAA harbor measurements and tide predictions; their timestamps are shown in the view.",
      },
    ],
  },
];
