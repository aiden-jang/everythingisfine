export function DustSliceControls({ open, toggle }: { open: boolean; toggle: () => void }) {
  return (
    <>
      <div className="observatory-actions">
        <button type="button" aria-pressed={open} onClick={toggle}>
          {open ? "Close lidar slice" : "Open lidar slice"}
        </button>
      </div>
      {open && (
        <div className="story-section-caption">
          <strong>CALIPSO · 23 June 2020</strong>
          <span>0–15 km · height exaggerated 80×</span>
          <span>Warm colors: stronger laser backscatter. Clouds also scatter light.</span>
        </div>
      )}
    </>
  );
}
