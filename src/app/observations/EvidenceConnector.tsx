import { createPortal } from "react-dom";

export function EvidenceConnector({ trace = false }: { trace?: boolean }) {
  return createPortal(
    <svg
      className="world-evidence-connector"
      data-evidence-connector=""
      data-trace={trace || undefined}
      aria-hidden="true"
    >
      <path fill="none" pathLength="1" />
      <circle r="3" />
    </svg>,
    document.querySelector(".zones") ?? document.body,
  );
}
