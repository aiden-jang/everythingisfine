import { useLayoutEffect, useRef, type RefObject } from "react";

export function ReplayInset({
  label,
  width,
  height,
  opacity,
  paint,
  detail,
  canvasRef,
}: {
  label: string;
  width: number;
  height: number;
  opacity: number;
  paint: (context: CanvasRenderingContext2D) => void;
  detail?: boolean;
  canvasRef?: RefObject<HTMLCanvasElement>;
}): JSX.Element {
  const localCanvas = useRef<HTMLCanvasElement>(null);
  const canvas = canvasRef ?? localCanvas;
  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) paint(context);
  }, [canvas, paint]);
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
