import { storyFindings } from "./findings";
import { findingTitles } from "./findingTitles";
import { useStoryNavigation } from "./StoryNavigation";

export function StoryFinding({ id, completed }: { id: string; completed: boolean }) {
  const navigation = useStoryNavigation();
  const finding = storyFindings[id];
  if (!completed || !finding) return null;
  return (
    <section className="story-finding" aria-label="What this view showed">
      <h3>{findingTitles[id] ?? "What this view showed"}</h3>
      <p>{finding}</p>
      {navigation?.returnLabel && (
        <button type="button" onClick={() => navigation.returnToBrowse()}>
          {navigation.returnLabel}
        </button>
      )}
    </section>
  );
}
