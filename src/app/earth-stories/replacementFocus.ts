interface FocusTarget {
  id: string;
  name: string;
  label: string;
  text: string;
  tag: string;
}

function identity(element: HTMLElement): FocusTarget {
  return {
    id: element.id,
    name: element.getAttribute("name") ?? "",
    label:
      element.getAttribute("aria-label") ??
      element.closest("label")?.querySelector("span")?.textContent ??
      "",
    text: element.matches("button, summary, a[href]") ? (element.textContent ?? "") : "",
    tag: element.tagName,
  };
}

export function captureStoryFocus(): (() => void) | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  const panel = active.closest<HTMLElement>(".replay-region");
  if (!panel) return;
  const target = identity(active);
  const scroll = panel.querySelector(".observatory-intro")?.scrollTop ?? 0;
  const open = Array.from(panel.querySelectorAll("details[open]")).map(
    (details) => details.querySelector("summary")?.textContent,
  );
  const fallback = active.closest("details")?.querySelector("summary")?.textContent;
  return () => {
    const replacement = document.querySelector<HTMLElement>(".replay-region");
    if (!replacement) return;
    replacement.querySelectorAll("details").forEach((details) => {
      details.open = open.includes(details.querySelector("summary")?.textContent);
    });
    const match = Array.from(
      replacement.querySelectorAll<HTMLElement>("button, input, select, summary, a[href]"),
    ).find((element) => {
      const candidate = identity(element);
      if (
        target.tag !== candidate.tag ||
        element.hasAttribute("disabled") ||
        !element.getClientRects().length
      )
        return false;
      if (target.id) return candidate.id === target.id;
      if (target.name) return candidate.name === target.name;
      if (target.label) return candidate.label === target.label;
      return !!target.text && candidate.text === target.text;
    });
    const reading = replacement.querySelector(".observatory-intro");
    if (reading) reading.scrollTop = scroll;
    const summary = Array.from(replacement.querySelectorAll("summary")).find(
      (element) => fallback && element.textContent === fallback,
    );
    (match ?? summary ?? replacement.querySelector<HTMLElement>(".observation-heading button"))?.focus({
      preventScroll: true,
    });
  };
}
