import { useEffect, useLayoutEffect } from "react";
import type { GlobeProps } from "./Globe";

type Values = Pick<
  GlobeProps,
  | "ramp"
  | "depthSink"
  | "cutaway"
  | "figures"
  | "moment"
  | "slab"
  | "aurora"
  | "marks"
  | "planetarium"
  | "inspection"
>;
type Slot<T> = { readonly current: T };
type Bindings = {
  [K in keyof Values]-?: Slot<
    (value: NonNullable<Values[K]> | (null extends Values[K] ? null : never)) => void
  >;
};

export function useGlobeLayers(
  values: Values,
  bindings: Bindings,
  draw: { wake: Slot<() => void>; redraw: Slot<() => void> },
): void {
  const { ramp, depthSink, cutaway, figures, moment, slab, aurora, marks, planetarium, inspection } = values;
  const {
    ramp: rampRef,
    depthSink: sinkRef,
    cutaway: cutawayRef,
    figures: figuresRef,
    moment: momentRef,
    inspection: inspectionRef,
    slab: slabRef,
    aurora: auroraRef,
    marks: marksRef,
    planetarium: skyRef,
  } = bindings;
  const { wake, redraw } = draw;
  useEffect(() => {
    rampRef.current(ramp);
  }, [ramp, rampRef]);
  useEffect(() => {
    sinkRef.current(depthSink ?? false);
  }, [depthSink, sinkRef]);
  useLayoutEffect(() => {
    cutawayRef.current(cutaway ?? null);
  }, [cutaway, cutawayRef]);
  // Lazy tables and displayed-time changes must wake the sleeping renderer.
  useEffect(() => {
    figuresRef.current(figures ?? null);
    wake.current();
  }, [figures, figuresRef, wake]);
  useLayoutEffect(() => {
    momentRef.current(moment ?? null);
    wake.current();
  }, [moment, momentRef, wake]);
  useLayoutEffect(() => {
    inspectionRef.current(inspection ?? null);
    wake.current();
    if (!inspection) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => wake.current();
    const unsubscribe = inspection.subscribe(onChange);
    motion.addEventListener("change", onChange);
    return () => {
      unsubscribe();
      motion.removeEventListener("change", onChange);
    };
  }, [inspection, inspectionRef, wake]);
  useEffect(() => {
    slabRef.current(slab ?? null);
  }, [slab, slabRef]);
  useEffect(() => {
    auroraRef.current(aurora ?? null);
    redraw.current();
  }, [aurora, auroraRef, redraw]);
  useEffect(() => {
    marksRef.current(marks ?? []);
    redraw.current();
  }, [marks, marksRef, redraw]);
  useLayoutEffect(() => {
    skyRef.current(planetarium ?? false);
    wake.current();
  }, [planetarium, skyRef, wake]);
}
