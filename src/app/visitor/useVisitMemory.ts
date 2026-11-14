import { useEffect, useLayoutEffect, useRef } from "react";
import type { ObservatoryProps } from "../Observatory";
import type { Visit, VisitPosition } from "./library";
import { useVisitLibrary } from "./useVisitLibrary";

// Capture before navigation disposes the player. See ARCHITECTURE.md#srcappvisitorusevisitmemoryts.
export function useVisitMemory(props: ObservatoryProps, active: string | null, completed: boolean) {
  const library = useVisitLibrary();
  const latest = useRef<() => Visit | null>(() => null);
  const opened = useRef({ id: active, at: Date.now() });
  if (opened.current.id !== active) opened.current = { id: active, at: Date.now() };
  const read = () => {
    if (!active) return null;
    const position: VisitPosition = {};
    const { observations, tonight, floatDive, skyCity } = props.views;
    const moment = observations.getMoment();
    if (moment?.id === active) position.moment = moment;
    const sky = tonight.view;
    if (sky && !sky.radiantTrail)
      position.sky = {
        city: skyCity.name,
        at: sky.at,
        look: { ...sky.look },
        ...(sky.moonfall ? { lunar: sky.moonfall.read() } : {}),
      };
    const float = floatDive.view;
    if (float) position.float = { profile: `${float.source}/${float.profile.id}`, index: float.read().index };
    if (props.radar.view)
      position.radar = {
        map: observations.map,
        ...(props.radar.view.region ? { region: props.radar.view.region } : {}),
        ...(props.radar.view.selectedAt !== undefined ? { at: props.radar.view.selectedAt } : {}),
      };
    return { id: active, seen: opened.current.at, position, ...(completed ? { completed: true } : {}) };
  };
  latest.current = read;
  const visit = library.visit;
  const checkpoint = props.views.visitCheckpoint;
  useLayoutEffect(() => {
    const save = () => {
      const value = latest.current();
      if (value) visit(value);
    };
    checkpoint.current = save;
    const hidden = () => {
      if (document.hidden) save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      checkpoint.current = () => {};
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [checkpoint, visit]);
  useEffect(() => {
    const value = latest.current();
    if (value) visit(value);
  }, [active, visit]);
  return { library, current: read };
}
