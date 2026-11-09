import type { PerspectiveCamera } from "three";

// The lens settles independently, so grabbing a flight does not snap its bank or horizon offset.
export function createCameraRig(camera: PerspectiveCamera, canvas: HTMLCanvasElement) {
  let bank = 0,
    lift = 0;
  let replayBank = 0;
  let replayPitch = 0;
  const snap = (nextBank = 0, nextLift = 0): void => {
    bank = nextBank;
    lift = nextLift;
  };
  return {
    snap,
    setReplayAngle(nextBank: number, nextPitch: number) {
      replayBank = nextBank;
      replayPitch = nextPitch;
    },
    step(dt: number, next: { bank: number; lift: number }, reduced: boolean): boolean {
      if (reduced) {
        snap();
        return false;
      }
      const amount = -Math.expm1(-14 * dt);
      bank += (next.bank - bank) * amount;
      lift += (next.lift - lift) * amount;
      if (Math.abs(bank - next.bank) < 0.00005) bank = next.bank;
      if (Math.abs(lift - next.lift) < 0.00005) lift = next.lift;
      return bank !== next.bank || lift !== next.lift;
    },
    apply(flat: boolean): void {
      const offset = flat ? 0 : lift;
      if (offset !== 0) {
        const width = canvas.clientWidth || 1,
          height = canvas.clientHeight || 1;
        camera.setViewOffset(width, height, 0, -offset * height, width, height);
      } else if (camera.view?.enabled) camera.clearViewOffset();
      if (!flat) {
        if (bank || replayBank) camera.rotateZ(bank + replayBank);
        if (replayPitch) camera.rotateX(replayPitch);
      }
    },
  };
}
