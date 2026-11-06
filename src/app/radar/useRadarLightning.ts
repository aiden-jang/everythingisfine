import { useEffect, useState } from "react";
import type { ObservationFrame } from "../observations/types";

export function useRadarLightning(at: number | undefined) {
  const [result, setResult] = useState<{ at: number; frame: ObservationFrame | null } | null>(null);
  useEffect(() => {
    if (at === undefined) return;
    const abort = new AbortController();
    void import("../../sources/observations/lightning")
      .then(({ radarLightning }) => radarLightning(at, abort.signal))
      .then(
        (frame) => {
          if (!abort.signal.aborted) setResult({ at, frame });
        },
        () => {
          if (!abort.signal.aborted) setResult({ at, frame: null });
        },
      );
    return () => abort.abort();
  }, [at]);
  return at !== undefined && result?.at === at ? result.frame : undefined;
}
