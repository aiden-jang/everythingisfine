import { useEffect } from "react";

export function useObservatoryEscape(onClose: () => void) {
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[data-feed-popover]:popover-open")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onClose]);
}
