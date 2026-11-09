import {
  BREAKUP,
  coast,
  END,
  dateIso,
  dateLabel,
  latestIndex,
  nameOf,
  positionAt,
  tracks,
} from "../../app/iceberg/icebergTimeline";
import approach from "../../app/iceberg/approach.webp?url";
import breakup from "../../app/iceberg/breakup.webp?url";
import fragments from "../../app/iceberg/fragments.webp?url";
import type { ObservationFrame, ObservationPath, ObservationSource } from "../../app/observations/types";

const photos = new Map([
  ["2020-11-05", { url: approach, alt: "Terra MODIS · Nov 5, 2020" }],
  ["2020-12-23", { url: breakup, alt: "Landsat 8 · Dec 23, 2020 · False color" }],
  ["2021-01-11", { url: fragments, alt: "NOAA-20 VIIRS · Jan 11, 2021" }],
]);
const target = { lon: -37.5, lat: -54.8, zoom: 2.4 };
const lens = { globe: 2.6, map: 5.6 };
const point = (lon: number, lat: number) => ({ lon, lat, lift: 0.009 });

const coastline = coast.flatMap((polygon) =>
  polygon.map((ring): ObservationPath => ({
    points: ring.map(([lon, lat]) => point(lon!, lat!)),
    color: 0x52798d,
  })),
);
const positions = new Map(tracks.map(({ id, fixes }) => [id, fixes.map(([, lon, lat]) => point(lon, lat))]));

export const iceberg: ObservationSource = {
  options: tracks.map(({ id }) => ({ id, label: nameOf(id) })),
  async load(option) {
    const selected = tracks.find((track) => track.id === option) ?? tracks[0]!;
    const frames: ObservationFrame[] = [];
    for (let day = 0; day <= END; day++) {
      const paths: ObservationPath[] = [...coastline];
      const marks = [];
      for (const track of tracks) {
        const highlighted = track.id === selected.id;
        const stop = latestIndex(track.fixes, day);
        const color = highlighted ? 0xe6c49c : 0x7b9cae;
        let segment = [];
        for (let i = 0; i <= stop; i++) {
          const [date] = track.fixes[i]!;
          if (i > 0 && date !== track.fixes[i - 1]![0] + 1) {
            if (segment.length > 1) paths.push({ points: segment, color });
            segment = [];
          }
          segment.push(positions.get(track.id)![i]!);
        }
        if (segment.length > 1) paths.push({ points: segment, color });
        const fix = positionAt(track, day, stop);
        if (fix) marks.push({ ...point(...fix), color, size: highlighted ? 14 : 8 });
      }
      const date = dateIso(day);
      const photograph = photos.get(date);
      const fixIndex = latestIndex(selected.fixes, day);
      const fix = selected.fixes[fixIndex];
      const status = !fix
        ? `This track starts ${dateLabel(selected.fixes[0]![0])}.`
        : fix[0] === day
          ? `Position recorded · ${dateLabel(day)}`
          : `Last recorded position · ${dateLabel(fix[0])}`;
      frames.push({
        at: Date.parse(date),
        timeLabel: dateLabel(day),
        reconstruction: true,
        paths,
        marks,
        ...(photograph ? { photograph } : {}),
        measurements: [{ label: nameOf(selected.id), value: status }],
      });
    }
    return {
      frames,
      target,
      lens,
      initial: selected === tracks[0] ? 0 : selected.fixes.at(-1)![0],
      chapters: [
        { index: 0, label: "Approach" },
        { index: BREAKUP, label: "Breakup" },
        { index: frames.findIndex((frame) => frame.at === Date.parse("2021-01-11")), label: "Fragments" },
      ],
      note: "Daily positions from Smith and Bigg, UK Polar Data Centre, OGL v3.0. Gaps remain open where the satellite record has no fix.",
    };
  },
};
