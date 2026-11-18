import { useCallback, useState } from "react";

export function usePlaceInspection(showPanel: (on: boolean) => void) {
  const [point, setPoint] = useState<{ lon: number; lat: number } | null>(null);
  const open = useCallback(
    (point: { lon: number; lat: number }) => {
      showPanel(true);
      setPoint(point);
    },
    [showPanel],
  );
  return { point, open, close: () => setPoint(null) };
}
