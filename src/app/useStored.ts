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
function useSaved<T>(
  key: string,
  initial: () => T,
  encode: (value: T) => string,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    store(key, encode(value));
  }, [key, encode, value]);
  return [value, setValue];
}

/* Module scope, so each is the same function on every render and the effect above can name it. */
const asFlag = (on: boolean): string => (on ? "1" : "0");
const asNumber = (n: number): string => String(n);
const asName = (name: string): string => name;

/** A switch. `whenUnset` is what it means for the preference never to have been written. */
export function useStoredFlag(
  key: string,
  whenUnset: boolean,
  override?: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  return useSaved(key, () => override ?? (whenUnset ? stored(key) !== "0" : stored(key) === "1"), asFlag);
}

/** A measurement. `bound` is applied on the way in as well, so a stored value out of range comes back inside it. */
export function useStoredNumber(
  key: string,
  fallback: number,
  bound: (n: number) => number = (n) => n,
): [number, Dispatch<SetStateAction<number>>] {
  return useSaved(key, () => bound(Number(stored(key)) || fallback), asNumber);
}

/** One of a fixed set of names, such as a colour ramp. */
export function useStoredName<T extends string>(
  key: string,
  fallback: T,
  override?: T,
): [T, Dispatch<SetStateAction<T>>] {
  return useSaved(key, () => override ?? (stored(key) as T | null) ?? fallback, asName);
}
