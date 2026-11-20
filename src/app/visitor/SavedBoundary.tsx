import { Component, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function SavedPanel({
  count,
  onClose,
  children,
}: {
  count: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const panel = dialog.current!;
    const phone = window.matchMedia("(max-width: 650px)");
    const show = () => {
      const focused = document.activeElement;
      if (panel.open) panel.close();
      if (phone.matches) panel.showModal();
      else panel.show();
      if (focused instanceof HTMLElement && panel.contains(focused)) focused.focus({ preventScroll: true });
      else heading.current?.focus({ preventScroll: true });
    };
    show();
    phone.addEventListener("change", show);
    return () => {
      phone.removeEventListener("change", show);
      panel.close();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      id="saved-observations"
      className="saved-collection"
      aria-label="Saved observations"
      data-single={count <= 1 || undefined}
      data-empty={count === 0 || undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="saved-collection-heading">
        <h2 ref={heading} id="saved-heading" tabIndex={-1}>
          What you noticed.
        </h2>
        <button type="button" onClick={onClose} aria-label="Close saved observations">
          Close
        </button>
      </div>
      <div className="saved-readings-heading">
        <h3>Saved readings</h3>
        <p>Kept on this device.</p>
      </div>
      {children}
    </dialog>,
    document.querySelector(".frame") ?? document.body,
  );
}

export class SavedBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="saved-empty">
        <p role="status">Your collection couldn’t open. Reload to try again.</p>
        <button type="button" onClick={() => location.reload()}>
          Reload app
        </button>
      </div>
    );
  }
}
