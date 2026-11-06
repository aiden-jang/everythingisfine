import { useEffect, useRef, useState } from "react";
import {
  argoCatalogue,
  argoCatalogueUrl,
  argoProfile,
  argoProfileUrl,
  argoStation,
  compileArgoProfile,
  type ArgoStation,
} from "../../sources/argo";
import { createFloatPlayback, type FloatDiveView } from "./floatPlayback";
import recorded from "./recorded.json";

const saved = recorded.flatMap(({ station, measurements }) => {
  const metadata = argoStation(station);
  const profile = metadata && compileArgoProfile(metadata, measurements);
  return profile ? [profile] : [];
});

type Catalogue = { state: "loading" | "ready" | "error"; stations: readonly ArgoStation[] };

const motion = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;

async function get(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) });
  if (response.status === 404) return { table: { rows: [] } };
  if (!response.ok) throw new Error("Argo request failed");
  return response.json() as Promise<unknown>;
}

export function useArgoProfiles(view: FloatDiveView | null, onView: (view: FloatDiveView) => void) {
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: "loading", stations: [] });
  const [revision, retry] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!view && saved[0]) onView(createFloatPlayback(saved[0], motion(), "recorded"));
  }, [onView, view]);

  useEffect(() => {
    const abort = new AbortController();
    setCatalogue({ state: "loading", stations: [] });
    void get(argoCatalogueUrl(), abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setCatalogue({ state: "ready", stations: argoCatalogue(data) });
      })
      .catch(() => {
        if (!abort.signal.aborted) setCatalogue({ state: "error", stations: [] });
      });
    return () => abort.abort();
  }, [revision]);

  useEffect(() => () => request.current?.abort(), []);

  function select(key: string) {
    request.current?.abort();
    request.current = null;
    setPending(null);
    setProblem(false);
    const local = saved.find(({ id }) => `recorded/${id}` === key);
    if (local) {
      onView(createFloatPlayback(local, motion(), "recorded"));
      return;
    }
    const remote = catalogue.stations.find(({ id }) => `recent/${id}` === key);
    if (!remote) return;
    const abort = new AbortController();
    request.current = abort;
    setPending(key);
    void get(argoProfileUrl(remote), abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return;
        const profile = argoProfile(remote, data);
        if (profile) onView(createFloatPlayback(profile, motion(), "recent"));
        else setProblem(true);
      })
      .catch(() => {
        if (!abort.signal.aborted) setProblem(true);
      })
      .finally(() => {
        if (request.current !== abort) return;
        request.current = null;
        setPending(null);
      });
  }

  return { saved, catalogue, pending, problem, select, retry: () => retry((value) => value + 1) };
}
