export function GlobeUnavailable({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div
      role="status"
      className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3 bg-void px-6 text-center text-dim"
    >
      <p className="text-[14px]">The globe could not start.</p>
      <p className="max-w-[30ch] text-[12px] text-faint">
        Your browser may have WebGL disabled. You can still explore the recent events and filters.
      </p>
      <button
        type="button"
        className="min-h-[44px] cursor-pointer rounded-md border border-hairline px-4 py-2 text-[12px] hover:bg-raised hover:text-ink"
        onClick={onRetry}
      >
        Try the globe again
      </button>
    </div>
  );
}
