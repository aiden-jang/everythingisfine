type Pointer = Pick<PointerEvent, "pointerId" | "clientX" | "clientY">;

export function createTapGesture() {
  const pointers = new Set<number>();
  let start: { id: number; x: number; y: number } | null = null;
  return {
    down(event: Pointer) {
      pointers.add(event.pointerId);
      start = pointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    },
    move(event: Pointer) {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) start = null;
    },
    up(event: Pointer) {
      const clicked =
        start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 5;
      pointers.delete(event.pointerId);
      start = null;
      return clicked && pointers.size === 0;
    },
    cancel(event: Pointer) {
      pointers.delete(event.pointerId);
      start = null;
    },
  };
}
