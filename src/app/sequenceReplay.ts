import type { Store } from "../data/store";
import type { Quake } from "../data/types";
import { distanceKm } from "../geo/sphere";
import type { RampName } from "../globe/ramp";
import type { Nearby } from "./nearby";

type RecordedEvent = Pick<Quake["primary"], "lon" | "lat" | "time" | "magnitude" | "place">;
const APPROACH = 1.05;
const PIN_HOLD = 0.8;
const SETTLE = 0.48;

export function createSequenceRun(quake: Quake, nearby: Nearby, store: Store, ramp: RampName) {
  const pin: RecordedEvent = quake.primary;
  const neighbours = nearby.sequence.flatMap(({ key }) => {
    const reading = store.get(key)?.primary;
    return reading ? [reading] : [];
  });
  if (neighbours.length === 0) return null;

  const ordered = [...neighbours, pin].sort((a, b) => a.time - b.time);
  const first = ordered[0]!.time;
  const last = ordered[ordered.length - 1]!.time;
  const pinAt = APPROACH + (first < pin.time ? 2.35 : 0);
  const afterPin = pinAt + PIN_HOLD;
  const end = afterPin + (last > pin.time ? 3.15 : 0) + SETTLE;
  const cueAt = (time: number): number => {
    if (time < pin.time) return APPROACH + ((time - first) / (pin.time - first)) * (pinAt - APPROACH);
    if (time === pin.time) return pinAt;
    return afterPin + ((time - pin.time) / (last - pin.time)) * (end - SETTLE - afterPin);
  };
  const events = ordered.map((reading) => ({ reading, cue: cueAt(reading.time), pinned: reading === pin }));
  const radiusKm = events.reduce(
    (max, { reading }) => Math.max(max, distanceKm(pin.lon, pin.lat, reading.lon, reading.lat)),
    0,
  );
  let elapsed = 0;
  let lastUpdate = 0;
  let shown = 0;
  const timeAt = (): number => {
    if (elapsed < APPROACH) return first;
    if (elapsed < pinAt) return first + ((elapsed - APPROACH) / (pinAt - APPROACH)) * (pin.time - first);
    if (elapsed <= afterPin || last === pin.time) return pin.time;
    if (elapsed >= end - SETTLE) return last;
    return pin.time + ((elapsed - afterPin) / (end - SETTLE - afterPin)) * (last - pin.time);
  };
  const subscribers = new Set<() => void>();
  let state = { at: first, shown: 0, playing: true, done: false, reduced: false };
  const publish = (playing: boolean, reduced: boolean) => {
    lastUpdate = elapsed;
    state = { at: timeAt(), shown, playing, done: elapsed >= end, reduced };
    for (const listener of subscribers) listener();
  };
  const locate = () => {
    // Upper bound includes every event with the same recorded instant in a single frame.
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid]!.cue <= elapsed + 1e-7) lo = mid + 1;
      else hi = mid;
    }
    shown = lo;
  };

  return {
    kind: "sequence" as const,
    key: quake.key,
    pin,
    events,
    ramp,
    radiusKm,
    first,
    last,
    read: () => state,
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    toggle: () => {
      if (state.done) {
        elapsed = APPROACH;
        locate();
      }
      publish(!state.playing, state.reduced);
    },
    seek: (at: number) => {
      elapsed = at >= last ? end : cueAt(Math.max(first, at));
      locate();
      publish(false, state.reduced);
    },
    step: (dt: number, reduced: boolean) => {
      if (reduced && !state.reduced) elapsed = end;
      else if (state.playing) elapsed = Math.min(end, elapsed + dt);
      locate();
      const done = elapsed >= end;
      if (
        done !== state.done ||
        reduced !== state.reduced ||
        elapsed - lastUpdate >= 0.1 ||
        (state.at < pin.time && elapsed >= pinAt)
      ) {
        publish(state.playing && !done && !reduced, reduced);
      }
      return { elapsed, shown, approach: Math.min(1, elapsed / APPROACH), moving: state.playing };
    },
  };
}

export type SequenceRun = NonNullable<ReturnType<typeof createSequenceRun>>;
