import { useLayoutEffect, useRef } from "react";

export function ReplayInset({
  label,
  width,
  height,
  opacity,
  paint,
  detail,
}: {
  label: string;
  width: number;
  height: number;
  opacity: number;
  paint: (context: CanvasRenderingContext2D) => void;
  detail?: boolean;
}): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) paint(context);
  }, [paint]);
  return (
    <canvas
      ref={canvas}
      className={`replay-inset${detail ? " replay-inset-detail" : ""}`}
      width={width}
      height={height}
      style={{ opacity }}
      role="img"
      aria-label={label}
    />
  );
}
