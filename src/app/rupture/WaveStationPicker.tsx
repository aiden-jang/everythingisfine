export function WaveStationPicker({
  stations,
  label,
  index,
  other,
  select,
}: {
  stations: readonly { id: string; name: string }[];
  label: string;
  index: number;
  other: number;
  select: (index: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={index} onChange={(event) => select(Number(event.currentTarget.value))}>
        {stations.map((station, i) => (
          <option key={station.id} value={i} disabled={i === other}>
            {station.name.split(",")[0]}
          </option>
        ))}
      </select>
    </label>
  );
}
