export function CreatorCredit(): JSX.Element {
  return (
    <footer className="creator-credit">
      <p>
        An observatory by{" "}
        <a
          href="https://www.aidenjang.com"
          target="_blank"
          rel="noreferrer"
          aria-describedby="external-link-hint"
        >
          aiden jang
        </a>
      </p>
      <nav className="observatory-policy-links" aria-label="Legal">
        <a href="https://accounts.aidenjang.com/privacy#legal-cookies-and-analytics">Privacy</a>
        <a href="https://accounts.aidenjang.com/terms">Terms</a>
      </nav>
    </footer>
  );
}
