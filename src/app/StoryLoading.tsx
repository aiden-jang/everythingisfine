export function StoryLoading({ children }: { children: React.ReactNode }) {
  return (
    <p className="story-loading" role="status">
      <span aria-hidden="true" />
      {children}
    </p>
  );
}
