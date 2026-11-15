import { storyFindings } from "./findings";

export function StoryFinding({ id, completed }: { id: string; completed: boolean }) {
  const finding = storyFindings[id];
  if (!completed || !finding) return null;
  return (
    <section className="story-finding" aria-label="What this view showed">
      <h3>What this view showed</h3>
      <p>{finding}</p>
    </section>
  );
}
