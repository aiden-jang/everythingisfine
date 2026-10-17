import { useEffect, useState } from "react";
import { loadMotion, summariseMotion, type MotionSample } from "../geo/plateMotion";
import { loadSlab, type SlabPoint } from "../geo/slab";
import { loadFigures, type FigureTable } from "../geo/stars";
import { loadZones, type ZoneTable } from "./viewer";

export function useGlobeResources({
  motionOn,
  slabOn,
  figuresOn,
}: {
  motionOn: boolean;
  slabOn: boolean;
  figuresOn: boolean;
}) {
  // Optional geometry loads independently and ignores completions after cleanup.
  const [zones, setZones] = useState<ZoneTable | null>(null);
  useEffect(() => {
    let alive = true;
    void loadZones()
      .then((next) => {
        if (alive) setZones(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [motionData, setMotionData] = useState<readonly MotionSample[]>([]);
  useEffect(() => {
    if (!motionOn || motionData.length > 0) return;
    let alive = true;
    void loadMotion()
      .then((next) => {
        if (alive) setMotionData(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [motionOn, motionData.length]);
  const [slabData, setSlabData] = useState<readonly SlabPoint[]>([]);
  useEffect(() => {
    if (!slabOn || slabData.length > 0) return;
    let alive = true;
    void loadSlab()
      .then((next) => {
        if (alive) setSlabData(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slabOn, slabData.length]);
  const [figureData, setFigureData] = useState<FigureTable>([]);
  useEffect(() => {
    if (!figuresOn || figureData.length > 0) return;
    let alive = true;
    void loadFigures()
      .then((next) => {
        if (alive) setFigureData(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [figuresOn, figureData.length]);
  const motion = motionOn && motionData.length > 0 ? summariseMotion(motionData) : null;
  return { zones, motionData, motion, slabData, figureData };
}
