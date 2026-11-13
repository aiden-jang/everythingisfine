const previews = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../assets/story-previews/*.webp", {
      eager: true,
      query: "?url&no-inline",
      import: "default",
    }),
  ).map(([path, url]) => [path.split("/").at(-1)!.replace(".webp", ""), url]),
);
const aliases: Record<string, string> = {
  "sun-watch": "sun",
  "meteor-nights": "meteors",
  "shadow-chase": "shadow",
  "lights-return": "lights",
  "tonight-sky": "sky",
  "orbital-pass": "orbit",
  "aurora-overflight": "aurora",
  "storm-radar": "radar",
  "float-dive": "float",
  "deep-time": "deep",
  "moonfall-story": "moonfall",
  "featured-moonfall": "moonfall",
};

export function storyKey(id: string): string {
  const key = id.replace(/^open-(story-)?/, "");
  return aliases[key] ?? key;
}

export function StoryThumbnail({ id }: { id: string }): JSX.Element | null {
  const src = previews[storyKey(id)];
  return src ? (
    <img
      className="story-thumbnail"
      src={src}
      alt=""
      title="Recorded view preview; open for the source and current availability."
      width="64"
      height="56"
      loading="lazy"
      decoding="async"
    />
  ) : null;
}
