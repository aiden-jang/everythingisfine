interface MobileNavigationProps {
  onResize: (height: number) => void;
}

export function MobileNavigation({ onResize }: MobileNavigationProps): JSX.Element {
  const show = (recent: boolean): void => {
    onResize(Math.round(window.innerHeight * (recent ? 0.46 : 0.82)));
    if (!recent) return;
    requestAnimationFrame(() => {
      const rail = document.getElementById("chrome-rail");
      const list = rail?.querySelector('[aria-label="Recent earthquakes"]');
      if (rail && list) {
        rail.scrollTo({
          top: rail.scrollTop + list.getBoundingClientRect().top - rail.getBoundingClientRect().top - 64,
        });
      }
    });
  };
  return (
    <nav aria-label="Explore" className="mobile-navigation md:hidden">
      <button type="button" onClick={() => show(false)}>
        View globe
      </button>
      <button type="button" onClick={() => show(true)}>
        Recent earthquakes
      </button>
    </nav>
  );
}
