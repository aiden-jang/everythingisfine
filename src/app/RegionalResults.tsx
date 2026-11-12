import { useRef } from "react";
import type { Region, RegionCount } from "./regions";
import { Resizer } from "./Resizer";
import { Row } from "./Row";
import { PLACE_LIMIT, type Hit, type Results } from "./search";

interface Props {
  flat: boolean;
  empty: string | null;
  query: string;
  results: Results;
  regions: RegionCount[];
  regionsHeight: number;
  pick: (hit: Hit) => void;
  onRegion: (region: Region) => void;
  onResize: (height: number) => void;
}

export function RegionalResults({
  flat,
  empty,
  query,
  results,
  regions,
  regionsHeight,
  pick,
  onRegion,
  onResize,
}: Props): JSX.Element | null {
  const regionsRef = useRef<HTMLDivElement>(null);
  const busiest = regions[0]?.count ?? 0;
  return query || (regions.length > 0 && !flat) ? (
    <div data-rail="regions" className="relative">
      {query || (regions.length > 0 && !flat) ? (
        <>
          <div ref={regionsRef} className="rail-regions scroll-fade">
            {query ? (
              results.hits.length > 0 ? (
                <>
                  {results.hits.map((hit) =>
                    hit.kind === "region" ? (
                      <Row
                        key={`r:${hit.region.name}`}
                        label={hit.region.name}
                        trail={`${hit.count}`}
                        onClick={() => pick(hit)}
                      />
                    ) : (
                      <Row
                        key={`p:${hit.name}`}
                        label={hit.name}
                        trail={`${hit.count} · M${hit.strongest.primary.magnitude.toFixed(1)}`}
                        onClick={() => pick(hit)}
                      />
                    ),
                  )}
                  {results.more > 0 ? (
                    <p className="px-1.5 pt-1.5 text-[11px] leading-relaxed text-faint">
                      {`${PLACE_LIMIT} of ${PLACE_LIMIT + results.more} places. `}
                      Narrow the query to see the rest.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="px-1.5 py-1 text-[11px] leading-relaxed text-faint" role="status">
                  {empty ??
                    "No matching earthquake reports in this view. Search by a region or a place named in a report."}
                </p>
              )
            ) : (
              <>
                <div className="label">Regions</div>
                {regions.map(({ region, count }) => (
                  <Row
                    key={region.name}
                    label={region.name}
                    trail={count.toLocaleString("en-GB")}
                    share={busiest > 0 ? count / busiest : 0}
                    onClick={() => onRegion(region)}
                  />
                ))}
              </>
            )}
          </div>
          <Resizer
            axis="y"
            label="Regions height"
            value={regionsHeight}
            min={64}
            max={360}
            measure={(e) => e.clientY - (regionsRef.current?.getBoundingClientRect().top ?? 0)}
            onChange={onResize}
            className="absolute inset-x-0 -bottom-2 hidden xl:block"
          />
        </>
      ) : null}
    </div>
  ) : null;
}
