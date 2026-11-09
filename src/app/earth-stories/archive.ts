import faultUrl from "../../sources/earth-stories/fault.json?url";
import fireUrl from "../../sources/earth-stories/fire.json?url";
import iceUrl from "../../sources/earth-stories/ice.json?url";

type FaultData = {
  lines: [number, number[][]][];
  points: {
    id: string;
    lon: number;
    lat: number;
    cm: number;
    event: string;
    sense: string;
    feature: string;
    observed: string;
  }[];
};
type FireData = { detections: number[][] };
type IceData = {
  bounds: [number, number, number, number];
  frames: { day: string; image: string; extent: number; median: number[][][] }[];
};

const urls = { fault: faultUrl, fire: fireUrl, ice: iceUrl };
type Archives = { fault: FaultData; fire: FireData; ice: IceData };
const cache = new Map<keyof Archives, Promise<unknown>>();
export function archive<K extends keyof Archives>(id: K): Promise<Archives[K]> {
  let pending = cache.get(id);
  if (!pending) {
    pending = fetch(urls[id], { signal: AbortSignal.timeout(20000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Archive unavailable");
        return response.json();
      })
      .catch((error: unknown) => {
        cache.delete(id);
        throw error;
      });
    cache.set(id, pending);
  }
  return pending as Promise<Archives[K]>;
}
