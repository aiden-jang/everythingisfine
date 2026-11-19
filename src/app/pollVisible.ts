export function pollVisible(load: (signal: AbortSignal) => Promise<unknown>, interval?: number) {
  let timer = 0;
  let alive = true;
  let leaving = false;
  let active: AbortController | null = null;
  let dueAt = 0;
  function start() {
    window.clearTimeout(timer);
    if (!alive || leaving || document.hidden || active) return;
    const delay = dueAt - Date.now();
    if (delay > 0) {
      if (Number.isFinite(delay)) timer = window.setTimeout(start, delay);
      return;
    }
    const request = new AbortController();
    active = request;
    const settled = () => {
      if (active !== request) return;
      active = null;
      dueAt = interval === undefined ? Infinity : Date.now() + interval;
      start();
    };
    void load(request.signal).then(settled, settled);
  }
  function pause() {
    window.clearTimeout(timer);
    const current = active;
    active = null;
    current?.abort();
  }
  function visibility() {
    if (document.hidden) pause();
    else start();
  }
  function leave() {
    leaving = true;
    pause();
  }
  function returnToPage() {
    leaving = false;
    start();
  }
  function reconnect() {
    if (active) return;
    dueAt = 0;
    start();
  }
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", leave);
  window.addEventListener("pageshow", returnToPage);
  if (interval !== undefined) window.addEventListener("online", reconnect);
  start();
  return () => {
    alive = false;
    pause();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("pageshow", returnToPage);
    window.removeEventListener("online", reconnect);
  };
}
