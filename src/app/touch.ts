/*
 * A short buzz when a mark is picked. On a phone the fingertip covers the mark, so nothing else confirms the
 * tap landed.
 *
 * On selection only, never on arrival. Buzzing because an earthquake happened is an alert, and an alert needs
 * consent; this cannot arrive uninvited, so it needs no toggle.
 *
 * Feature-detected, not user-agent sniffed. Safari on iOS does not implement `navigator.vibrate`.
 *
 * Twelve milliseconds. Longer reads as a notification.
 */

/** Short enough to read as contact rather than as a notification. */
export const TICK_MS = 12;

/**
 * Buzz once, if the device can. Wrapped because a `vibrate` call can throw rather than return false: some
 * engines reject it outright when the document has never been interacted with.
 */
export function tick(nav: Pick<Navigator, "vibrate"> | undefined = globalThis.navigator): void {
  try {
    nav?.vibrate?.(TICK_MS);
  } catch {
    // Nothing to fall back to, and nothing worth reporting: the panel opens either way.
  }
}
