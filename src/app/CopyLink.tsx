import { reportAnalytics } from "../../analytics/browser";
import { useRef, useState } from "react";
import { useViewLocation } from "./viewLocation";

export function CopyLink({
  format,
  label = "Copy link",
}: { format?: (url: string) => string; label?: string } = {}) {
  const href = useViewLocation();
  const busy = useRef(false);
  const [result, setResult] = useState({ url: "", failed: false, pending: false });
  const current = result.url === (format?.(href) ?? href);
  const caption = result.pending ? 1 : current && !result.failed ? 2 : 0;
  const copy = async () => {
    if (busy.current) return;
    busy.current = true;
    const url = format?.(location.href) ?? location.href;
    setResult({ url, failed: false, pending: true });
    try {
      await navigator.clipboard.writeText(url);
      reportAnalytics({ name: "share_created" });
      setResult({ url, failed: false, pending: false });
    } catch {
      setResult({ url, failed: true, pending: false });
    } finally {
      busy.current = false;
    }
  };
  return (
    <div className="ml-auto flex max-w-full flex-wrap gap-2">
      <button
        type="button"
        className="inline-grid min-h-11 cursor-pointer place-items-center border border-hairline px-3 py-2 text-[11px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
        disabled={result.pending}
        aria-busy={result.pending}
        onClick={() => void copy()}
      >
        {[label, "Copying…", "Link copied"].map((text, index) => (
          <span key={index} className={`col-start-1 row-start-1 ${index === caption ? "" : "invisible"}`}>
            {text}
          </span>
        ))}
      </button>
      {result.failed && !result.pending && (
        <div className="w-full text-[11px] text-dim" role="status">
          Couldn’t copy. You can copy the link below.
          <input
            className="mt-2 min-h-11 w-full border border-hairline bg-deck p-2 text-ink"
            aria-label="Link to copy"
            readOnly
            value={format ? result.url : href}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
