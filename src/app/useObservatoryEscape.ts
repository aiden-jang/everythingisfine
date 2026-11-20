import { useEffect } from "react";

export function useObservatoryEscape(onClose: () => void) {
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest("[data-open-compass]")) return;
      if (
        document.querySelector(
          "#saved-observations, [data-feed-popover]:popover-open, [data-view-popover]:popover-open",
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onClose]);
}
