import { ObservationChart } from "../observations/ObservationChart";
import { StoryCompass } from "./StoryCompass";
import { StorySitePicker } from "./StoryOverlay";
import type { EarthStoryData, StorySite } from "./types";
import type { ObservationFrame } from "../observations/types";

export function StoryReadings({
  data,
  frame,
  index,
  north,
  site,
  selected,
  chooseSite,
}: {
  data: EarthStoryData;
  frame: ObservationFrame;
  index: number;
  north: boolean;
  site: string;
  selected: StorySite | undefined;
  chooseSite: (value: string) => void;
}) {
  return (
    <>
      {frame.measurements && (
        <dl className="observation-values">
          {(north ? frame.measurements.slice(0, 1) : frame.measurements).map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {north && data.series?.[0]?.samples[index] && frame.measurements?.[1] && (
        <StoryCompass value={data.series[0].samples[index][1]} label={frame.measurements[1].label} />
      )}
      {data.sites && (
        <StorySitePicker sites={data.sites} site={site} choose={chooseSite} value={selected?.value} />
      )}
      {data.series && <ObservationChart series={data.series} at={frame.at} units={data.units} />}
      {data.legend && (
        <ul className="story-legend">
          {data.legend.map((item) => (
            <li key={item.label}>
              <i style={{ backgroundColor: item.color }} data-ramp="" />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
