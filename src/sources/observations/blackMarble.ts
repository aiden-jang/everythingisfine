import before from "./black-marble/maria-before.webp?url";
import early from "./black-marble/maria-early.webp?url";
import mid from "./black-marble/maria-mid.webp?url";
import late from "./black-marble/maria-late.webp?url";

export const blackMarbleSource = "https://svs.gsfc.nasa.gov/4658/";
export const mariaStudy = "https://doi.org/10.1371/journal.pone.0218883";
export const puertoRico = { lon: -66.43, lat: 18.23, zoom: 1.85 };

export const lightsPeriods = [
  {
    title: "Before Maria",
    dates: "Pre-storm baseline",
    image: before,
    note: "Lights trace the coast, with the brightest cluster around San Juan.",
  },
  {
    title: "Early aftermath",
    dates: "20 Sep – 20 Nov 2017",
    image: early,
    note: "The first two-month average shows an island much darker than before the storm.",
  },
  {
    title: "Months 3–4",
    dates: "21 Nov 2017 – 20 Jan 2018",
    image: mid,
    note: "More light returns around San Juan and coastal towns. Much of the interior is still dim.",
  },
  {
    title: "Months 5–6",
    dates: "21 Jan – 20 Mar 2018",
    image: late,
    note: "Many coastal clusters have brightened. Compare with the baseline to see where gaps remain.",
  },
] as const;

export async function loadBlackMarble() {
  await Promise.all(
    lightsPeriods.map(({ image: url }) => {
      const image = new Image();
      image.src = url;
      return image.decode();
    }),
  );
}
