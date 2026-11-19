import { useEffect, useState } from "react";
import { fetchAurora, type Aurora } from "../sources/aurora";
import { fetchCyclones, type Cyclone } from "../sources/cyclones";
import { fetchFloods, type Flood } from "../sources/floods";
import { fetchVolcanoes, type Volcano } from "../sources/volcanoes";
import { fetchWildfires, type Wildfire } from "../sources/wildfires";
import { timedFetch } from "../sources/types";
import type { HazardLayer } from "./format";
import type { FeedChecks, LayerAnswer } from "./feedStatus";
import { pollVisible } from "./pollVisible";

const POLL_MS = 10 * 60_000;

export interface HazardLayers {
  aurora: Aurora | null;
  cyclones: readonly Cyclone[];
  fires: readonly Wildfire[];
  floods: readonly Flood[];
  volcanoes: readonly Volcano[];
  answered: Record<HazardLayer, LayerAnswer>;
  checked: FeedChecks;
}

/** The five layers that are polled rather than streamed, and whether each has been heard from. */
export function useHazardLayers(): HazardLayers {
  const [aurora, setAurora] = useState<Aurora | null>(null);
  const [cyclones, setCyclones] = useState<readonly Cyclone[]>([]);
  /* Both parsers must filter on their own dates, not on `iscurrent`. Measured: every fire is flagged
  current, and 81 of a hundred floods were up to a year old. */
  const [fires, setFires] = useState<readonly Wildfire[]>([]);
  const [floods, setFloods] = useState<readonly Flood[]>([]);
  const [volcanoes, setVolcanoes] = useState<readonly Volcano[]>([]);
  const [health, setHealth] = useState<{ answered: Record<HazardLayer, LayerAnswer>; checked: FeedChecks }>({
    answered: {
      cyclones: "pending",
      volcanoes: "pending",
      fires: "pending",
      floods: "pending",
      aurora: "pending",
    },
    checked: {},
  });

  useEffect(() => {
    async function refresh<T>(
      signal: AbortSignal,
      layer: HazardLayer,
      fetchLayer: (get: (url: string) => Promise<Response>, onAnswer: (ok: boolean) => void) => Promise<T>,
      apply: (next: T) => void,
    ) {
      let answered = false;
      const next = await fetchLayer(
        (url) => timedFetch(url, signal),
        (ok) => {
          if (signal.aborted) return;
          answered = ok;
          const at = Date.now();
          setHealth((old) => ({
            answered: { ...old.answered, [layer]: ok ? "ok" : "failed" },
            checked: ok ? { ...old.checked, [layer]: at } : old.checked,
          }));
        },
      );
      if (answered && !signal.aborted) apply(next);
    }
    const stop = pollVisible(
      (signal) =>
        Promise.all([
          refresh(signal, "aurora", fetchAurora, setAurora),
          refresh(signal, "cyclones", fetchCyclones, setCyclones),
          refresh(signal, "fires", fetchWildfires, setFires),
          refresh(signal, "floods", fetchFloods, setFloods),
        ]),
      POLL_MS,
    );
    const stopVolcanoes = pollVisible(
      (signal) => refresh(signal, "volcanoes", fetchVolcanoes, setVolcanoes),
      6 * 60 * 60_000,
    );
    return () => {
      stop();
      stopVolcanoes();
    };
  }, []);

  return { aurora, cyclones, fires, floods, volcanoes, ...health };
}
