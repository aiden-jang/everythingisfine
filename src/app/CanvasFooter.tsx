export function CanvasFooter({
  flat,
  playing,
  archived,
  clearable,
}: {
  flat: boolean;
  playing: boolean;
  archived: boolean;
  clearable: boolean;
}): JSX.Element {
  return (
    <div
      className="relative order-2 flex w-full flex-wrap items-end gap-x-6 gap-y-2
              md:justify-center"
    >
      <p className="creator-credit py-1.5 text-[11px] text-faint md:absolute md:bottom-0 md:left-0">
        made by{" "}
        <a
          href="https://www.aidenjang.com"
          target="_blank"
          aria-describedby="external-link-hint"
          rel="noreferrer"
          // Inline-flex lets the mobile minimum height apply to the link.
          className="pointer-events-auto inline-flex items-center text-faint underline decoration-from-font underline-offset-2 transition-colors hover:text-dim max-md:min-h-11"
        >
          aiden jang
        </a>
      </p>
      <div className="key-hints pointer-events-auto bg-deck/40 px-2.5 py-1.5 font-mono text-[10.5px] text-faint backdrop-blur-xl backdrop-saturate-50">
        {/* What the keys do in this projection: a row saying orbit while the drag pans is worse than none. */}
        {(
          [
            ["arrows", flat ? "pan" : "orbit"],
            ["+ -", "zoom"],
            ["0", "reset"],
            ["space", playing ? "pause" : "play"],
            [", .", "step"],
            ...(archived ? [["[ ]", "day"] as const] : []),
            ...(flat ? [["shift-drag", "section"] as const] : []),
            ["f", "full"],
            /* Only when there is something to clear, or the app offers `esc` on every first load. `markId`
                belongs in this list and in the ladder: a mark card is a pin. */
            ...(clearable ? [["esc", "clear"] as const] : []),
          ] as const
        ).map(([key, what]) => (
          <span key={key} className="mr-3 inline-flex items-baseline gap-1.5">
            <span className="text-dim">{key}</span>
            {what}
          </span>
        ))}
      </div>
    </div>
  );
}
