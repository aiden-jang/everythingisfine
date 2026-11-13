import type { ComponentProps, ReactNode } from "react";
import { EarthquakeHeadline } from "./EarthquakeHeadline";
import { EventList } from "./EventList";
import type { FeedSnapshot } from "./feed";
import { Dial } from "./Dial";

export function EarthquakeInspector({
  headline,
  stats,
  options,
  filters,
  legend,
  timeline,
  query,
  clockBins,
  regionalResults,
  list,
}: {
  options: ReactNode;
  stats: FeedSnapshot["stats"];
  headline: ComponentProps<typeof EarthquakeHeadline>;
  filters: ReactNode;
  legend: ReactNode;
  timeline: ReactNode;
  query: { value: string; change: (value: string) => void; pickFirst: () => void };
  clockBins: ComponentProps<typeof Dial>["counts"];
  regionalResults: ReactNode;
  list: ComponentProps<typeof EventList>;
}) {
  return (
    <section className="earthquake-inspector" aria-label="Earthquake activity">
      <EarthquakeHeadline {...headline} />
      <div data-rail="legend">{filters}</div>
      {legend && <div className="mt-4">{legend}</div>}

      {timeline}

      <div data-rail="when">
        <div role="search" className="mb-1.5 flex flex-col gap-1 xl:flex-row xl:items-baseline xl:gap-2">
          <label htmlFor="find" className="label shrink-0">
            Find earthquake reports
          </label>
          <input
            id="find"
            type="text"
            value={query.value}
            onChange={(e) => query.change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              query.pickFirst();
            }}
            placeholder="a region or a place"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 border border-hairline bg-transparent px-1.5 py-1
                  text-[12px] text-ink placeholder:text-faint"
          />
        </div>
        <details>
          <summary className="disclose text-[11px] text-faint hover:text-dim">Time of day</summary>
          <Dial counts={clockBins} />
        </details>
      </div>

      {query.value && regionalResults}
      <EventList {...list} />
      {options}
      <details className="layer-sources">
        <summary>Report totals</summary>
        <dl>
          {[
            ["Earthquakes before filters", stats.quakes],
            ["Reported by both agencies", stats.corroborated],
            ["Reports revised", stats.revised],
            ["USGS readings", stats.readings.usgs],
            ["EMSC readings", stats.readings.emsc],
          ].map(([label, count]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{count.toLocaleString("en-GB")}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
