import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import atlas from "world-atlas/land-50m.json" with { type: "json" };
import { regionalCoast } from "./regional-coast.mjs";

const catalogue = "d56d9e3f-80d2-4076-9e70-24f662c0e362";
const start = "2020-11-05";
const end = "2021-04-16";
const dayMs = 86_400_000;
const out = fileURLToPath(new URL("../src/app/iceberg/", import.meta.url));

async function retrieve(url, checksum) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  const content = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(content).digest("hex") !== checksum) {
    throw new Error(`Unexpected source revision for ${url}`);
  }
  return content;
}

async function records(name, checksum) {
  const filename = `/A68_icebergs_positions_and_dimensions_2020-21-${name}.csv`;
  const entry = `synth:${catalogue}:${Buffer.from(filename).toString("base64")}`;
  const url = new URL("https://ramadda.data.bas.ac.uk/repository/entry/get");
  url.searchParams.set("entryid", entry);
  return (await retrieve(url, checksum))
    .toString()
    .split(/\r?\n/)
    .filter((line) => /^\d{4}-/.test(line))
    .map((line) => line.split(","))
    .filter(([date]) => date >= start && date <= end);
}

const day = (stamp) => (Date.parse(stamp) - Date.parse(start)) / dayMs;
const coordinate = (lat, lon) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
function fixes(rows, field) {
  return rows.flatMap((row) => {
    const lat = Number(row[field]);
    const lon = Number(row[field + 1]);
    return coordinate(lat, lon) ? [[day(row[0]), lon, lat]] : [];
  });
}

const nasa = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/147000";
const images = [
  {
    name: "approach",
    path: "147535/iceberga68a_tmo_2020310_lrg.jpg",
    sha: "7420c86055c03459c88e31649e3482275e6586d1b4cab9b7c7d664be1b7f0e2d",
    transform: ["-crop", "300", "1180", "760", "455"],
  },
  {
    name: "breakup",
    path: "147715/a68_oli_2020358_lrg.jpg",
    sha: "b2a3696f24378c49ba82220519d644366e5921060bc500f8e6c56ff084d7f63e",
    transform: ["-resize", "1400", "0"],
  },
  {
    name: "fragments",
    path: "147785/iceberga68_vir_202111_lrg.jpg",
    sha: "1147837c897bcf4c5eee941f952cd9be14611be948e0ed6e4941c1d7d2482518",
    transform: ["-resize", "1260", "0"],
  },
];

const tmp = await mkdtemp(join(tmpdir(), "eif-iceberg-"));
try {
  await mkdir(out, { recursive: true });
  const [parent, pieces] = await Promise.all([
    records("A68A", "0bba9d6b88de261caa428cbf5ddf6cffd85d02d755966d893081ff0e5264ef71"),
    records("A68D-P", "4b7464d1205db75e637e07ecd8ade1d8c8538decea5348502880631c0bd9df22"),
    ...images.map(async ({ name, path, sha, transform }) => {
      const input = join(tmp, `${name}.jpg`);
      await writeFile(input, await retrieve(`${nasa}/${path}`, sha));
      execFileSync("cwebp", ["-quiet", "-q", "83", ...transform, input, "-o", join(out, `${name}.webp`)]);
    }),
  ]);
  const tracks = [
    { id: "A", fixes: fixes(parent, 1) },
    ...Array.from("DEFGHIJKLMNOP", (id, i) => ({ id, fixes: fixes(pieces, 1 + i * 2) })),
  ];
  const axes = parent.flatMap(([stamp, , , lat1, lon1, lat2, lon2]) =>
    coordinate(Number(lat1), Number(lon1)) && coordinate(Number(lat2), Number(lon2))
      ? [[day(stamp), Number(lon1), Number(lat1), Number(lon2), Number(lat2)]]
      : [],
  );
  const areas = parent.flatMap(([stamp, , , , , , , length, width, area]) =>
    area !== "9999"
      ? [{ day: day(stamp), length: Number(length), width: Number(width), area: Number(area) }]
      : [],
  );
  if (tracks.some(({ fixes }) => fixes.length === 0) || tracks[0].fixes.at(-1)[0] !== day(end)) {
    throw new Error("Incomplete Polar Data Centre track");
  }
  const coast = regionalCoast(atlas, { west: -65, east: -21, south: -68, north: -43 });
  await writeFile(join(out, "a68.json"), JSON.stringify({ start, end, tracks, axes, areas, coast }) + "\n");
  console.log(`Packed ${tracks.length} iceberg tracks and three NASA observations.`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
