import { hazardCount, type HazardGroup } from "./hazards";
export function HazardList({
  hazards,
  markId,
  onHazard,
  inline = false,
}: {
  inline?: boolean;
  hazards: HazardGroup[];
  markId: string | null;
  onHazard: (id: string) => void;
}): JSX.Element | null {
  const rows = (
    <>
      {hazards.length > 0 ? (
        <div className="hazard-reports">
          <div className="mt-1.5 max-h-[240px] overflow-y-auto pr-1 xl:max-h-none xl:overflow-visible xl:pr-0">
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
                    className={`-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] cursor-pointer items-center gap-2 rounded-[2px] px-1 py-2 text-left transition-colors hover:bg-raised ${
                      markId === row.id ? "bg-raised" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 text-xs break-words text-dim">{row.name}</span>
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
        </div>
      ) : null}
    </>
  );
  return inline ? (
    rows
  ) : (
    <details className="mt-3">
      <summary className="disclose">Storms, fires, floods and volcanoes ({hazardCount(hazards)})</summary>
      {rows}
    </details>
  );
}
