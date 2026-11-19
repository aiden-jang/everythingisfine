import type { ReactNode } from "react";

export function MapLegend({
  open,
  onChange,
  children,
  embedded,
}: {
  open: boolean;
  onChange: (open: boolean) => void;
  children: ReactNode;
  embedded: boolean;
}) {
  if (embedded) return <div data-ramp>{children}</div>;
  return (
    <div data-ramp>
      <details open={open}>
        <summary
          className="disclose text-[11px] text-faint hover:text-dim"
          onClick={(event) => {
            event.preventDefault();
            onChange(!open);
          }}
        >
          Legend
        </summary>
        {children}
      </details>
    </div>
  );
}
