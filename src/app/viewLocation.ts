import { useSyncExternalStore } from "react";

const VIEW_LOCATION_CHANGE = "eif:view-location-change";

export function replaceViewLocation(url: string): void {
  history.replaceState(null, "", url);
  window.dispatchEvent(new Event(VIEW_LOCATION_CHANGE));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(VIEW_LOCATION_CHANGE, onChange);
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(VIEW_LOCATION_CHANGE, onChange);
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const currentLocation = (): string => location.href;

export function useViewLocation(): string {
  return useSyncExternalStore(subscribe, currentLocation);
}
