import { SkyCityPicker, type SkyCityPreference } from "../tonight/SkyCityPicker";
import type { EarthStoryId } from "./catalogue";
import { storyChoices, usesCity } from "./storySelection";

export function StoryChoices({
  id,
  city,
  choice,
  select,
}: {
  id: EarthStoryId;
  city: SkyCityPreference;
  choice: string;
  select: (value: string) => void;
}): JSX.Element {
  const selection = storyChoices(id);
  return (
    <>
      {usesCity(id) && <SkyCityPicker city={city.name} select={city.select} />}
      {selection && (
        <label className="observation-picker">
          <span>{selection.label}</span>
          <select value={choice} onChange={(event) => select(event.currentTarget.value)}>
            {selection.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
