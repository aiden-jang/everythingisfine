import { WINDOWS } from "./windows";

export function LayerWindow({
  hours,
  onChange,
  held,
  onLive,
}: {
  hours: number;
  onChange: (hours: number) => void;
  held: boolean;
  onLive: () => void;
}): JSX.Element {
  return (
    <section aria-label="Layer time window">
      <p className="mb-2 text-xs text-dim">Reports in the selected time window</p>
      <div className="flex gap-2" role="group" aria-label="Window">
        {WINDOWS.map((window) => (
          <button
            type="button"
            key={window.hours}
            aria-pressed={hours === window.hours}
            onClick={() => onChange(window.hours)}
            className="min-h-11 cursor-pointer rounded-md border border-hairline px-3 text-xs text-dim aria-pressed:bg-raised aria-pressed:text-ink"
          >
            {window.label}
          </button>
        ))}
      </div>
      {held && (
        <button
          type="button"
          onClick={onLive}
          className="mt-2 min-h-11 cursor-pointer text-xs underline underline-offset-4"
        >
          Return to live
        </button>
      )}
    </section>
  );
}
