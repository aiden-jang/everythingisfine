import moon from "../sources/moonfall/recordings/moon.webp";

export function FeaturedStory({ ready, open }: { ready: boolean; open: () => void }): JSX.Element {
  return (
    <button
      type="button"
      id="open-featured-moonfall"
      className="featured-story"
      disabled={!ready}
      onClick={open}
      aria-label="Moonfall"
      aria-describedby="featured-story-note"
    >
      <img src={moon} alt="" width="96" height="96" decoding="async" />
      <span>
        <strong>Moonfall</strong>
        <small>Featured replay · Apollo 17, 1972</small>
        <span id="featured-story-note">Follow the rover across the lunar surface.</span>
        <span className="featured-story-link">Open story</span>
      </span>
    </button>
  );
}
