import { useCallback, useMemo, useState } from "react";
import { distanceKm } from "../../geo/sphere";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { savedVisitKey } from "../visitor/library";
import { ObservationChart } from "./ObservationChart";
import { discharge, gaugeUrl, riverUnit } from "./riverGauges";
import type { GeoPoint, ObservationFrame, ObservationSeries, RiverGaugeReading } from "./types";

export function useRiverGauge(frame: ObservationFrame | undefined, chapter: string | undefined) {
  const [selected, select] = useState(chapter?.startsWith("gauge:") ? chapter.slice(6) : undefined);
  const [preview, setPreview] = useState<string>();
  const gauges = frame?.gauges;
  const gauge =
    gauges?.find(({ id, available }) => id === selected && available) ??
    gauges?.find(({ available }) => available);
  const active =
    preview && gauges?.some(({ id, available }) => id === preview && available) ? preview : gauge?.id;
  const shown = useMemo(() => {
    if (!frame?.gauges || !frame.marks) return frame;
    return {
      ...frame,
      marks: frame.marks.map((mark) =>
        mark.id === active
          ? {
              ...mark,
              size: 20,
              color: gauges?.find(({ id }) => id === active)?.value === undefined ? 0xc4ccd6 : 0x8ae7ef,
            }
          : mark,
      ),
    } satisfies ObservationFrame;
  }, [frame, gauges, active]);
  const pick = useCallback(
    (point: GeoPoint) => {
      const marks = frame?.marks;
      if (!marks) return;
      const distances = marks.map(({ id, lon, lat }) => ({
        id,
        km: distanceKm(point.lon, point.lat, lon, lat),
      }));
      const nearest = distances.sort((a, b) => a.km - b.km)[0];
      if (nearest && nearest.km < 28) {
        setPreview(undefined);
        select(nearest.id);
      }
    },
    [frame],
  );
  return { gauge, active, shown, pick, select, setPreview };
}

export function RiverReading({
  at,
  gauges,
  series,
  selection,
  current,
  pause,
}: {
  at: number;
  gauges: readonly RiverGaugeReading[];
  series: readonly ObservationSeries[];
  selection: ReturnType<typeof useRiverGauge>;
  current: boolean;
  pause: () => void;
}) {
  const navigation = useStoryNavigation();
  const { gauge, active, select, setPreview } = selection;
  const sample = gauge?.value;
  const [attempted, setAttempted] = useState("");
  const key = gauge ? `river:${gauge.id}:${at}` : "";
  const kept = navigation?.library.saved.some((visit) => savedVisitKey(visit) === key);
  return (
    <>
      <div className="river-gauges" role="group" aria-label="River gauges">
        {gauges.map(({ id, label, value, available }, index) => (
          <button
            key={id}
            type="button"
            disabled={!available}
            aria-pressed={gauge?.id === id}
            data-highlighted={active === id || undefined}
            data-secondary={index === 1 || undefined}
            onFocus={() => setPreview(id)}
            onBlur={() => setPreview(undefined)}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setPreview(id);
            }}
            onPointerLeave={() => setPreview(undefined)}
            onClick={() => {
              select(id);
              setPreview(undefined);
            }}
          >
            <span className="chart-swatch" aria-hidden="true" />
            <span>{label}</span>
            <strong>
              {value === undefined ? (available ? "No reading" : "Unavailable") : discharge(value)}
            </strong>
          </button>
        ))}
      </div>
      <ObservationChart series={series} at={at} units={riverUnit} station={active} river />
      {gauge && (
        <div className="river-reading">
          <button
            type="button"
            disabled={!current || sample === undefined || !navigation}
            aria-disabled={kept || undefined}
            onClick={() => {
              const visit = navigation?.current();
              const moment = visit?.position.moment;
              if (!navigation || !visit || !moment || sample === undefined || kept) return;
              pause();
              setAttempted(key);
              void navigation.library.save({
                ...visit,
                position: {
                  ...visit.position,
                  moment: { ...moment, at, chapter: `gauge:${gauge.id}` },
                  river: { gauge: gauge.id, at, value: sample },
                },
              });
            }}
          >
            {kept ? "Reading kept" : "Keep reading"}
          </button>
          <a href={gaugeUrl(gauge.id)} target="_blank" rel="noreferrer">
            USGS · {gauge.label}
          </a>
          {attempted === key && <span role="status">{navigation?.library.notice}</span>}
        </div>
      )}
    </>
  );
}
