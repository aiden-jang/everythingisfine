const interactions = [
  "pointerdown",
  "wheel",
  "keydown",
  "click",
  "popstate",
  "hashchange",
  "pagehide",
  "scene-annotation",
];

/** Intent wins over a late location result, including requests whose provider ignores cancellation. */
export function locationAttempt(target: EventTarget, interrupted = () => {}) {
  let active = true;
  const finish = () => {
    if (!active) return false;
    active = false;
    for (const event of interactions) target.removeEventListener(event, cancel, true);
    return true;
  };
  const cancel = () => {
    if (finish()) interrupted();
  };
  for (const event of interactions) target.addEventListener(event, cancel, { capture: true, passive: true });
  return { finish, cancel };
}
