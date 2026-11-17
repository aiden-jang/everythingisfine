export function pollVisible(load: () => Promise<unknown>, interval: number) {
  let timer = 0;
  let alive = true;
  let loading = false;
  let due = true;
  const settled = () => {
    loading = false;
    if (!alive) return;
    timer = window.setTimeout(() => {
      due = true;
      start();
    }, interval);
  };
  const start = () => {
    if (!alive || document.hidden || loading || !due) return;
    loading = true;
    due = false;
    void load().then(settled, settled);
  };
  document.addEventListener("visibilitychange", start);
  start();
  return () => {
    alive = false;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", start);
  };
}
