import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { store, stored } from "./stored";

/*
 * A preference that remembers itself.
 *
 * Written on the change and never in an effect. An effect that writes unconditionally fires on mount and
 * saves the default as though somebody had chosen it, which quietly freezes every viewer on whatever the
 * default was the day they first opened the page. Deferring it to an effect that skips the first render
 * fixes that but leaves a window: a reload landing inside it reads back the size nobody chose.
 *
 * So the write happens in the setter, where there is nothing to skip and nothing to race.
 */
function useSaved<T>(
  key: string,
  initial: () => T,
  encode: (value: T) => string,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  /* Mirrors the state so an updater form can be resolved here. This setter is the only writer. */
  const latest = useRef(value);

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const next = typeof action === "function" ? (action as (prev: T) => T)(latest.current) : action;
      latest.current = next;
      store(key, encode(next));
      setValue(next);
    },
    [key, encode],
  );

  return [value, set];
}

/* Module scope, so each is the same function on every render and the setter above can name it. */
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
  return useSaved(
    key,
    () => {
      const saved = stored(key);
      const value = saved === null || saved.trim() === "" ? fallback : Number(saved);
      return bound(Number.isFinite(value) ? value : fallback);
    },
    asNumber,
  );
}

/** One of a fixed set of names, such as a colour ramp. */
export function useStoredName<T extends string>(
  key: string,
  fallback: T,
  choices: readonly T[],
  override?: T,
): [T, Dispatch<SetStateAction<T>>] {
  return useSaved(
    key,
    () => {
      const value = override ?? stored(key);
      return choices.includes(value as T) ? (value as T) : fallback;
    },
    asName,
  );
}
