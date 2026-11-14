import { useEffect, useRef, useSyncExternalStore } from "react";

// Only the mounted journey owns this bridge to the shared globe's camera control.
let owner: { resume: () => void; interrupted: boolean } | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());
const read = () => owner?.interrupted ?? false;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useInterruptedJourney() {
  const interrupted = useSyncExternalStore(subscribe, read);
  return { interrupted, resume: () => owner?.resume() };
}

export function useJourneyGestures(pause: () => void, resume: () => void, canResume: boolean) {
  const actions = useRef({ pause, resume });
  actions.current = { pause, resume };
  useEffect(() => {
    const control = {
      interrupted: false,
      resume() {
        control.interrupted = false;
        actions.current.resume();
        publish();
      },
    };
    owner = control;
    publish();
    const canvas = document.querySelector("#globe-view canvas");
    const globe = document.getElementById("globe-view");
    const stop = () => {
      actions.current.pause();
      control.interrupted = canResume;
      publish();
    };
    const key = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (active && active !== document.body && active !== globe) return;
      if (/^(Arrow(Left|Right|Up|Down)|[+\-_=])$/.test(event.key)) stop();
    };
    canvas?.addEventListener("pointerdown", stop);
    canvas?.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      canvas?.removeEventListener("pointerdown", stop);
      canvas?.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", key);
      if (owner === control) {
        owner = null;
        publish();
      }
    };
  }, [canResume]);
}
