import before from "./black-marble/maria-before.webp?url";
import early from "./black-marble/maria-early.webp?url";
import mid from "./black-marble/maria-mid.webp?url";
import late from "./black-marble/maria-late.webp?url";

export const blackMarbleSource = "https://svs.gsfc.nasa.gov/4658/";
export const mariaStudy = "https://doi.org/10.1371/journal.pone.0218883";
export const puertoRico = { lon: -66.42, lat: 18.22, zoom: 2.4 };
export const lightsLens = { globe: 11.5, map: 30 };

// The four SVS stills share one crop. Fit the baseline coast to Natural Earth 1:10m and
// use the same display registration for each period; the stills have no world file.
export const lightsBounds = [-67.286, 17.835, -65.536, 18.611] as const;
export const lightsCorners = [
  { lon: -67.276006, lat: 17.836425 },
  { lon: -65.552118, lat: 17.835298 },
  { lon: -67.28505, lat: 18.610088 },
  { lon: -65.536943, lat: 18.606408 },
] as const;

export const lightsPeriods = [
  {
    title: "Before Maria",
    at: Date.UTC(2017, 8, 19),
    dates: "Pre-storm baseline",
    image: before,
    note: "Lights trace the coast, with the brightest cluster around San Juan.",
  },
  {
    title: "Early aftermath",
    at: Date.UTC(2017, 8, 20),
    dates: "20 Sep – 20 Nov 2017",
    image: early,
    note: "The first two-month average shows an island much darker than before the storm.",
  },
  {
    title: "Months 3–4",
    at: Date.UTC(2017, 10, 21),
    dates: "21 Nov 2017 – 20 Jan 2018",
    image: mid,
    note: "More light returns around San Juan and coastal towns. Much of the interior is still dim.",
  },
  {
    title: "Months 5–6",
    at: Date.UTC(2018, 0, 21),
    dates: "21 Jan – 20 Mar 2018",
    image: late,
    note: "Many coastal clusters have brightened. Compare with the baseline to see where gaps remain.",
  },
] as const;

export async function loadBlackMarble() {
  return Promise.all(
    lightsPeriods.map(({ image: url }) => {
      const image = new Image();
      image.src = url;
      return image.decode().then(() => image);
    }),
  );
}
