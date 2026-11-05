import type { PerspectiveCamera } from "three";

const SKY_PITCH = (26 * Math.PI) / 180;

// The camera pitches, not the sky catalogue: every star keeps its displayed-time direction.
export function createPlanetarium(camera: PerspectiveCamera) {
  let amount = 0,
    from = 0,
    target = 0,
    elapsed = 0,
    duration = 1;
  let wanted = false,
    moving = false;
  const set = (on: boolean): void => {
    wanted = on;
    from = amount;
    target = on ? 1 : 0;
    elapsed = 0;
    duration = (on ? 1.45 : 0.95) * Math.abs(target - from);
    moving = amount !== target;
  };
  return {
    set,
    resume(): void {
      if (wanted && !moving && amount !== 1) set(true);
    },
    interrupt(): void {
      moving = false;
    },
    clear(): void {
      amount = from = target = elapsed = 0;
      wanted = moving = false;
    },
    ready: (): boolean => !moving,
    wanted: (): boolean => wanted,
    step(dt: number, reduced: boolean): boolean {
      if (!moving) return false;
      elapsed = Math.min(duration, elapsed + dt);
      const t = reduced ? 1 : duration > 0 ? elapsed / duration : 1;
      amount = from + (target - from) * (1 - (1 - t) ** 3);
      if (t >= 1) {
        amount = target;
        moving = false;
      }
      return moving;
    },
    apply(): void {
      if (amount !== 0) camera.rotateX(SKY_PITCH * amount);
    },
  };
}
