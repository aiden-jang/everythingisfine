import { useStoredName } from "../useStored";
import { skyCities } from "./cities";

const names = skyCities.map(({ name }) => name);
const defaultCity = () =>
  skyCities.find(({ zone }) => zone === Intl.DateTimeFormat().resolvedOptions().timeZone) ?? skyCities[0]!;

export function useSkyCity() {
  const [name, select] = useStoredName("sky-city", defaultCity().name, names);
  const city = skyCities.find((city) => city.name === name) ?? skyCities[0]!;
  return { name, city, select };
}

export type SkyCityPreference = ReturnType<typeof useSkyCity>;

export function SkyCityPicker({
  city,
  select,
}: {
  city: string;
  select: (name: string) => void;
}): JSX.Element {
  return (
    <label className="tonight-city">
      <span>City</span>
      <select value={city} onChange={(event) => select(event.currentTarget.value)}>
        {names.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  );
}
