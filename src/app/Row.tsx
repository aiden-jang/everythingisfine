export function Row({
  lead,
  label,
  trail,
  share,
  onClick,
}: {
  lead?: string;
  label: string;
  trail: string;
  share?: number;
  onClick?: () => void;
}): JSX.Element {
  const body = (
    <>
      {lead ? <span className="w-[34px] shrink-0 font-mono text-[12px] text-ink">{lead}</span> : null}
      <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{label}</span>
      <span className="shrink-0 font-mono text-[10.5px] text-faint">{trail}</span>
      {share === undefined || share <= 0 ? null : (
        <span aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-[3px]">
          <span className="block h-px bg-dim" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </span>
      )}
    </>
  );

  const shared = "relative flex w-full items-baseline gap-3 rounded-[2px] px-1.5 py-[7px] text-left";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${shared} cursor-pointer transition-colors hover:bg-raised`}
    >
      {body}
    </button>
  ) : (
    <div className={shared}>{body}</div>
  );
}
