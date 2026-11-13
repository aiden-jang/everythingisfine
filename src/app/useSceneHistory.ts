import { useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { flushSync } from "react-dom";
import type { CameraState } from "../globe/controls";
import type { FlyTo } from "../globe/cameraTarget";

type Snapshot<T> = { value: T; camera: CameraState; scroll: number; scrollTarget: string; focus: string };

export function useSceneHistory<T>({
  route,
  checkpoint,
  readCamera,
  flyTo,
  lastWritten,
}: {
  route: { key: string; capture: () => T; restore: (value: T) => void };
  checkpoint: MutableRefObject<() => void>;
  readCamera: MutableRefObject<() => CameraState>;
  flyTo: MutableRefObject<FlyTo>;
  lastWritten: MutableRefObject<string>;
}) {
  const [state] = useState(() => ({
    session: crypto.randomUUID(),
    id: 0,
    next: 0,
    key: route.key,
    snapshots: new Map<number, Snapshot<T>>(),
    restoring: false,
  }));
  const latest = useRef(route);
  latest.current = route;
  useLayoutEffect(() => {
    const current = state;
    checkpoint.current = () => {
      if (current.restoring || latest.current.key !== current.key) return;
      current.snapshots.set(current.id, {
        value: latest.current.capture(),
        camera: { ...readCamera.current() },
        scroll:
          document.getElementById(
            document.querySelector('[data-presentation="explore"]') ? "chrome-rail" : "observatory-intro",
          )?.scrollTop ?? 0,
        scrollTarget: document.querySelector('[data-presentation="explore"]')
          ? "chrome-rail"
          : "observatory-intro",
        focus: document.activeElement?.id ?? "",
      });
    };
    history.replaceState({ ...history.state, observatory: { session: current.session, id: current.id } }, "");
    const back = (event: PopStateEvent) => {
      const target = event.state?.observatory;
      if (target?.session !== current.session) return;
      const saved = current.snapshots.get(target.id);
      if (!saved) return;
      checkpoint.current();
      current.id = target.id;
      current.restoring = true;
      lastWritten.current = location.hash;
      flushSync(() => latest.current.restore(saved.value));
      flyTo.current(saved.camera.lon, saved.camera.lat, saved.camera.zoom);
      requestAnimationFrame(() => {
        document.getElementById(saved.scrollTarget)?.scrollTo(0, saved.scroll);
        const focus = document.getElementById(saved.focus);
        if (focus?.getClientRects().length) focus.focus({ preventScroll: true });
      });
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      checkpoint.current = () => {};
    };
  }, [checkpoint, readCamera, flyTo, lastWritten, state]);
  useLayoutEffect(() => {
    const current = state;
    if (current.key !== route.key) {
      current.key = route.key;
      if (!current.restoring) {
        for (const id of current.snapshots.keys()) if (id > current.id) current.snapshots.delete(id);
        current.id = ++current.next;
        history.pushState(
          { ...history.state, observatory: { session: current.session, id: current.id } },
          "",
        );
      }
    }
    current.restoring = false;
    if (!current.snapshots.has(current.id)) checkpoint.current();
  }, [route.key, checkpoint, state]);
}
