import { useRef } from "react";
import { hazardCount, type HazardGroup } from "./hazards";
import type { Region, RegionCount } from "./regions";
import { Resizer } from "./Resizer";
import { Row } from "./Row";
import { PLACE_LIMIT, type Hit, type Results } from "./search";

interface Props {
  flat: boolean;
  hours: number;
  query: string;
  results: Results;
  regions: RegionCount[];
  hazards: HazardGroup[];
  markId: string | null;
  regionsHeight: number;
  pick: (hit: Hit) => void;
  onRegion: (region: Region) => void;
  onHazard: (id: string) => void;
  onResize: (height: number) => void;
}

export function RegionalResults({
  flat,
  hours,
  query,
  results,
  regions,
  hazards,
  markId,
  regionsHeight,
  pick,
  onRegion,
  onHazard,
  onResize,
}: Props): JSX.Element | null {
  const regionsRef = useRef<HTMLDivElement>(null);
  const busiest = regions[0]?.count ?? 0;
  return query || (regions.length > 0 && !flat) || hazards.length > 0 ? (
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
                /* Say which nothing this is. There is no gazetteer and cannot be one keylessly, so a real place
                    with no seismicity looks exactly like a typo. */
                <p className="px-1.5 py-1 text-[11px] leading-relaxed text-faint">
                  Nothing in the {hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`} on
                  screen. This searches the named regions and the places these two agencies put on the events
                  it holds, not a map of the world.
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

      {hazards.length > 0 ? (
        <details className="mt-3">
          <summary className="disclose text-[11px] text-faint hover:text-dim">
            Storms, fires, floods and volcanoes ({hazardCount(hazards)})
          </summary>
          <div className="mt-1.5 max-h-[240px] overflow-y-auto pr-1">
            {hazards.map((group) => (
              <div key={group.kind} className="mt-1.5 first:mt-0">
                <div className="label">{group.label}</div>
                {group.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    data-hazard-row={row.id}
                    aria-current={markId === row.id || undefined}
                    onClick={() => onHazard(row.id)}
                    className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline gap-2 rounded-[2px] px-1 py-1 text-left transition-colors hover:bg-raised ${
                      markId === row.id ? "bg-raised" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{row.name}</span>
                    {row.measure ? (
                      <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
                        {row.measure}
                      </span>
                    ) : null}
                    {row.age ? (
                      <span className="shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
                        {row.age}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  ) : null;
}
