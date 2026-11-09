import { APRIL_ECLIPSE_DAY } from "../geo/aprilEclipse";
import { RuptureReveal, TOHOKU_DAY } from "./rupture/RuptureReveal";
import { StormReplay } from "./storm/StormReplay";
import { TongaReplay } from "./tonga/TongaReplay";
import { MegaflashReplay } from "./megaflash/MegaflashReplay";

export function ObservatoryHistory({
  onHistory,
  onPickDate,
  onKilauea,
}: {
  onHistory: (day: string) => void;
  onPickDate: () => void;
  onKilauea: () => void;
}): JSX.Element {
  return (
    <>
      <button type="button" onClick={() => onHistory(TOHOKU_DAY)}>
        Japan, 2011 ↗
      </button>
      <RuptureReveal />
      <StormReplay />
      <TongaReplay />
      <button type="button" id="open-kilauea" onClick={onKilauea}>
        Follow Kīlauea’s lava
      </button>
      <MegaflashReplay />
      <button type="button" onClick={() => onHistory("2013-05-24")}>
        Deep beneath Okhotsk ↗
      </button>
      <button type="button" onClick={() => onHistory(APRIL_ECLIPSE_DAY)}>
        Total eclipse, 2024 ↗
      </button>
      <button type="button" onClick={onPickDate}>
        Pick a past date
      </button>
    </>
  );
}
