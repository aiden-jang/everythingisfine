export interface PanelReturn {
  scrollTarget: string;
  scroll: number;
  focus: string;
  fallback?: string;
}

export function restorePanel(saved: PanelReturn) {
  const panel = document.getElementById(saved.scrollTarget);
  if (!panel?.getClientRects().length) return;
  panel.scrollTo(0, saved.scroll);
  const target = [saved.focus, saved.fallback, saved.scrollTarget]
    .map((id) => (id ? document.getElementById(id) : null))
    .find((element) => element?.getClientRects().length && !element.hasAttribute("disabled"));
  target?.focus({ preventScroll: true });
}
