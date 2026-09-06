import type { JSX } from "react";
import type { FeedStatus } from "./feedStatus";

/* Achromatic, because DESIGN.md 3.1 keeps hue for the data: a green dot here is the chrome borrowing
   the alphabet the ramp uses. Brightness says how much is in, the blink says more is coming. */
const DOT = {
  archived: "bg-faint",
  settling: "bg-dim motion-safe:animate-pulse",
  complete: "bg-ink",
  partial: "bg-dim",
} as const;

export function FeedDot({
  feeds,
  archiveFrom,
}: {
  feeds: FeedStatus;
  archiveFrom: number | null;
}): JSX.Element {
  const state =
    archiveFrom !== null
      ? "archived"
      : feeds.settling
        ? "settling"
        : feeds.arrived === feeds.total
          ? "complete"
          : "partial";
  return (
    <span className="flex items-center gap-2 text-[11px] whitespace-nowrap text-dim">
      <span className={`inline-block size-[6px] rounded-full ${DOT[state]}`} />
      {/* The date always shows and only the live phrase folds. "Everything is normal" is reassurance and
        the dot carries it; "this is not what you think" is a correction, and absence is its failure. */}
      {archiveFrom !== null ? (
        <span className="font-mono">{new Date(archiveFrom).toISOString().slice(0, 10)}</span>
      ) : (
        <span className="hidden sm:inline">{feeds.phrase}</span>
      )}
    </span>
  );
}
