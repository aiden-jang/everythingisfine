export function KeepMark({ kept }: { kept: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" className="keep-mark" data-kept={kept} aria-hidden="true">
      <path d="M5 3h10v14l-5-3-5 3V3Z" />
    </svg>
  );
}
