import { useEffect, useState } from "react";
import { restorePanel, type PanelReturn } from "./panelReturn";

export function usePanelReturn() {
  const [restoration] = useState(() => {
    let frame = 0;
    const cancel = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    return {
      cancel,
      restore(saved: PanelReturn) {
        cancel();
        frame = requestAnimationFrame(() => {
          frame = 0;
          restorePanel(saved);
        });
      },
    };
  });
  useEffect(() => restoration.cancel, [restoration]);
  return restoration;
}
