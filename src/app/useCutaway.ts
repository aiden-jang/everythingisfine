import { useState } from "react";
import type { CutawayFocus } from "../globe/cutaway";

// Inspection belongs to this visit; opening a shared view should not silently cut its surface away.
export function useCutaway(anchor: () => CutawayFocus, setDepth: (on: boolean) => void) {
  const [cutaway, setCutaway] = useState<CutawayFocus | null>(null);
  return {
    cutaway,
    onCutaway: (on: boolean) => {
      if (on) setDepth(true);
      const at = anchor();
      setCutaway(on ? { lon: at.lon, lat: at.lat } : null);
    },
    onSink: (on: boolean) => {
      if (!on) setCutaway(null);
      setDepth(on);
    },
  };
}
