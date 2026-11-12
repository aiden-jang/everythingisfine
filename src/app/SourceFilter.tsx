import type { SourceId } from "../data/types";
import { SOURCE_NAMES } from "./format";

export function SourceFilter({
  sources,
  toggleSource,
}: {
  sources: ReadonlySet<SourceId>;
  toggleSource: (source: SourceId) => void;
}) {
  return (
    <div className="mt-3">
      <span className="label block">Earthquake sources</span>
      <div role="group" aria-label="Earthquake sources" className="mt-1 flex gap-1.5">
        {(["usgs", "emsc"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => toggleSource(id)}
            aria-pressed={sources.has(id)}
            className={`cursor-pointer border px-2.5 py-1 text-[11px] transition-colors ${
              sources.has(id)
                ? "border-faint bg-raised text-ink"
                : "border-hairline text-faint hover:bg-raised hover:text-dim"
            }`}
          >
            {SOURCE_NAMES[id]}
          </button>
        ))}
      </div>
    </div>
  );
}
