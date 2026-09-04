import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { store, stored } from "./stored";

/*
 * A preference that remembers itself.
 *
 * The saving happens on a change and never on the first render. An effect that writes unconditionally
 * fires on mount and saves the default as though somebody had chosen it, which quietly freezes every
 * viewer on whatever the default was the day they first opened the page.
 */
function useSaved<T>(initial: () => T, save: (value: T) => void): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const mounted = useRef(false);
  const latest = useRef(save);
  // Assigned in an effect, not during render, and declared first so it lands before the one below.
  useEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    latest.current(value);
  }, [value]);
  return [value, setValue];
}

/** A switch. `whenUnset` is what it means for the preference never to have been written. */
export function useStoredFlag(
  key: string,
  whenUnset: boolean,
  override?: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  return useSaved(
    () => override ?? (whenUnset ? stored(key) !== "0" : stored(key) === "1"),
    (on) => store(key, on ? "1" : "0"),
  );
}

/** A measurement. `bound` is applied on the way in as well, so a stored value out of range comes back inside it. */
export function useStoredNumber(
  key: string,
  fallback: number,
  bound: (n: number) => number = (n) => n,
): [number, Dispatch<SetStateAction<number>>] {
  return useSaved(
    () => bound(Number(stored(key)) || fallback),
    (n) => store(key, String(n)),
  );
}

/** One of a fixed set of names, such as a colour ramp. */
export function useStoredName<T extends string>(
  key: string,
  fallback: T,
  override?: T,
): [T, Dispatch<SetStateAction<T>>] {
  return useSaved(
    () => override ?? (stored(key) as T | null) ?? fallback,
    (name) => store(key, name),
  );
}
