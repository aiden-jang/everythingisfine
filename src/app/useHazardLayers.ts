import { useCallback, useEffect, useState } from "react";
import { fetchAurora, type Aurora } from "../sources/aurora";
import { fetchCyclones, type Cyclone } from "../sources/cyclones";
import { fetchFloods, type Flood } from "../sources/floods";
import { fetchVolcanoes, type Volcano } from "../sources/volcanoes";
import { fetchWildfires, type Wildfire } from "../sources/wildfires";
import { timedFetch } from "../sources/types";
import type { HazardLayer } from "./format";
import type { LayerAnswer } from "./feedStatus";

const POLL_MS = 10 * 60_000;

export interface HazardLayers {
  aurora: Aurora | null;
  cyclones: readonly Cyclone[];
  fires: readonly Wildfire[];
  floods: readonly Flood[];
  volcanoes: readonly Volcano[];
  answered: Record<HazardLayer, LayerAnswer>;
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
  /* Three states, not two. A boolean starting at `true` means "has not failed", which cannot say
     whether a layer has arrived. */
  const [answered, setAnswered] = useState<Record<HazardLayer, LayerAnswer>>({
    cyclones: "pending",
    volcanoes: "pending",
    fires: "pending",
    floods: "pending",
    aurora: "pending",
  });
  const answerFor = useCallback(
    (layer: HazardLayer) =>
      (ok: boolean): void => {
        const next = ok ? "ok" : "failed";
        setAnswered((was) => (was[layer] === next ? was : { ...was, [layer]: next }));
      },
    [],
  );

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchAurora(timedFetch, answerFor("aurora")).then((next) => {
        if (alive && next) setAurora(next);
      });
      void fetchCyclones(timedFetch, answerFor("cyclones")).then((next) => {
        if (alive) setCyclones(next);
      });
      void fetchWildfires(timedFetch, answerFor("fires")).then((next) => {
        if (alive) setFires(next);
      });
      void fetchFloods(timedFetch, answerFor("floods")).then((next) => {
        if (alive) setFloods(next);
      });
    };
    load();
    /* Once, not on the ten-minute clock: the newest episode is weeks old, so polling learns nothing. */
    void fetchVolcanoes(timedFetch, answerFor("volcanoes")).then((next) => {
      if (alive) setVolcanoes(next);
    });
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [answerFor]);

  return { aurora, cyclones, fires, floods, volcanoes, answered };
}
