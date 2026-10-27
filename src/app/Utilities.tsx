import { useEffect, useRef, useState, type ReactNode } from "react";

export function Utilities({ children }: { children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(max-width: 767px)");
    panel.current?.querySelector("button")?.focus();
    const outside = (event: Event): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
    };
    const resize = (): void => {
      if (!media.matches) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape, true);
    media.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape, true);
      media.removeEventListener("change", resize);
    };
  }, [open]);
  return (
    <div ref={root} className="contents">
      <div
        ref={panel}
        id="utility-controls"
        onClick={() => {
          if (!open) return;
          setOpen(false);
          toggle.current?.focus();
        }}
        className={`utility-controls flex items-center gap-2 max-md:absolute max-md:top-full max-md:right-4 max-md:z-10 max-md:flex max-md:flex-col max-md:items-stretch max-md:gap-1.5 max-md:border max-md:border-hairline max-md:bg-deck max-md:p-2 ${open ? "" : "max-md:hidden"}`}
      >
        {children}
      </div>
      <button
        id="utility-toggle"
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="utility-controls"
        onClick={() => setOpen((value) => !value)}
        className="w-[3.25rem] shrink-0 cursor-pointer border border-hairline px-2.5 py-1 text-center text-[11px] whitespace-nowrap text-faint transition-colors hover:bg-raised hover:text-ink md:hidden"
      >
        {open ? "less" : "more"}
      </button>
    </div>
  );
}
