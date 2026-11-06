import { APRIL_ECLIPSE_DAY } from "../geo/aprilEclipse";
import { RuptureReveal, TOHOKU_DAY } from "./rupture/RuptureReveal";
import { StormReplay } from "./storm/StormReplay";
import { TongaReplay } from "./tonga/TongaReplay";
import { KilaueaReplay } from "./kilauea/KilaueaReplay";
import { IcebergReplay } from "./iceberg/IcebergReplay";
import { MegaflashReplay } from "./megaflash/MegaflashReplay";

export function ObservatoryHistory({
  onHistory,
  onPickDate,
}: {
  onHistory: (day: string) => void;
  onPickDate: () => void;
}): JSX.Element {
  return (
    <div className="observatory-history">
      <details>
        <summary>Historical replays</summary>
        <div className="observatory-history-links">
          <button type="button" onClick={() => onHistory(TOHOKU_DAY)}>
            Japan, 2011 ↗
          </button>
          <RuptureReveal />
          <StormReplay />
          <TongaReplay />
          <KilaueaReplay />
          <IcebergReplay />
          <MegaflashReplay />
          <button type="button" onClick={() => onHistory("2013-05-24")}>
            Deep beneath Okhotsk ↗
          </button>
          <button type="button" onClick={() => onHistory(APRIL_ECLIPSE_DAY)}>
            Total eclipse, 2024 ↗
          </button>
        </div>
      </details>
      <button type="button" onClick={onPickDate}>
        Pick a past date
      </button>
    </div>
  );
}
