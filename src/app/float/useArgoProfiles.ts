import type { VisitPosition } from "../visitor/library";
import { useCallback, useEffect, useRef, useState } from "react";
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

export function useArgoProfiles(
  view: FloatDiveView | null,
  onView: (view: FloatDiveView) => void,
  resume?: VisitPosition["float"],
) {
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: "loading", stations: [] });
  const [revision, retry] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<"resume" | "selection" | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (view || !saved[0]) return;
    const profile = saved.find(({ id }) => `recorded/${id}` === resume?.profile) ?? saved[0];
    const playback = createFloatPlayback(profile, !resume && motion(), "recorded");
    if (resume?.profile === `recorded/${profile.id}`) playback.seek(resume.index);
    onView(playback);
  }, [onView, view, resume]);

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

  const select = useCallback(
    (key: string, index?: number) => {
      request.current?.abort();
      request.current = null;
      setPending(null);
      setProblem(null);
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
          if (profile) {
            const playback = createFloatPlayback(profile, index === undefined && motion(), "recent");
            if (index !== undefined) playback.seek(index);
            onView(playback);
          } else setProblem(index === undefined ? "selection" : "resume");
        })
        .catch(() => {
          if (!abort.signal.aborted) setProblem(index === undefined ? "selection" : "resume");
        })
        .finally(() => {
          if (request.current !== abort) return;
          request.current = null;
          setPending(null);
        });
    },
    [catalogue.stations, onView],
  );
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !resume?.profile.startsWith("recent/") || catalogue.state !== "ready") return;
    restored.current = true;
    if (catalogue.stations.some(({ id }) => `recent/${id}` === resume.profile))
      select(resume.profile, resume.index);
    else setProblem("resume");
  }, [catalogue, resume, select]);

  return {
    saved,
    catalogue,
    pending,
    problem,
    select,
    retry: () => {
      restored.current = false;
      retry((value) => value + 1);
    },
  };
}
