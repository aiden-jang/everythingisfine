import { useCallback, useState } from "react";

type Point = { lon: number; lat: number };

export function usePlaceInspection(showPanel: (on: boolean) => void, initial?: Point) {
  const [point, setPoint] = useState<Point | null>(initial ?? null);
  const open = useCallback(
    (point: Point) => {
      showPanel(true);
      setPoint(point);
    },
    [showPanel],
  );
  return { point, open, close: () => setPoint(null) };
}
