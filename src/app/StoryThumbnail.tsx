import moon from "../sources/moonfall/recordings/moon.webp";
import lights from "../sources/observations/black-marble/maria-before.webp";
import smoke from "../sources/observations/archive-assets/smoke-0.webp";

const previews: Record<string, string> = { moonfall: moon, lights, smoke };

export function StoryThumbnail({ id }: { id: string }): JSX.Element | null {
  const src =
    previews[
      id
        .replace(/^open-(story-)?/, "")
        .replace(/-story$/, "")
        .replace("lights-return", "lights")
    ];
  return src ? (
    <img
      className="story-thumbnail"
      src={src}
      alt=""
      width="64"
      height="56"
      loading="lazy"
      decoding="async"
    />
  ) : null;
}
