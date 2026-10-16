import { useRef, useState } from "react";

export function CitationActions({
  citation,
  scope,
  withLink = false,
}: {
  citation: () => string;
  scope: string;
  withLink?: boolean;
}) {
  const busy = useRef(false);
  const [result, setResult] = useState({ text: "", scope: "", kind: "", failed: false, pending: false });
  const copy = async (text: string, kind: string) => {
    if (busy.current) return;
    busy.current = true;
    setResult({ text, scope, kind, failed: false, pending: true });
    try {
      await navigator.clipboard.writeText(text);
      setResult({ text, scope, kind, failed: false, pending: false });
    } catch {
      setResult({ text, scope, kind, failed: true, pending: false });
    } finally {
      busy.current = false;
    }
  };
  const current =
    result.scope === scope &&
    (result.kind === "Citation" || (result.kind === "Link" && result.text === location.href));
  const buttonClass =
    "min-h-11 cursor-pointer border border-hairline px-3 py-2 text-[11px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50";
  return (
    <div className="ml-auto flex max-w-full flex-wrap gap-2">
      {withLink && (
        <button
          type="button"
          className={buttonClass}
          disabled={result.pending}
          onClick={() => void copy(location.href, "Link")}
        >
          {current && result.kind === "Link" && !result.failed && !result.pending
            ? "Link copied"
            : "Copy link"}
        </button>
      )}
      <button
        type="button"
        className={buttonClass}
        disabled={result.pending}
        onClick={() => void copy(citation(), "Citation")}
      >
        Copy citation
      </button>
      {current && !result.pending && (
        <div className="w-full text-[11px] text-dim" role="status">
          {result.failed
            ? "Couldn’t copy. Select the text below and copy it manually, or try again."
            : `${result.kind} copied`}
          {result.failed && (
            <textarea
              className="mt-2 min-h-32 w-full border border-hairline bg-deck p-2 text-ink"
              aria-label={`${result.kind} to copy`}
              readOnly
              value={result.text}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </div>
      )}
    </div>
  );
}
