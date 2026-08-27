/*
 * A tick in the hand when something is picked.
 *
 * On a phone the marks are a few pixels across and the fingertip covers them, so the only confirmation a tap
 * landed is the panel appearing a moment later.
 *
 * On selection only, never on arrival. Buzzing a phone because an earthquake happened is an alert, and an
 * alert is something a person opts into. A tick that fires only when a finger just tapped cannot arrive
 * uninvited, which is also why it needs no toggle.
 *
 * Android only in practice: `navigator.vibrate` is unimplemented in Safari on iOS. Feature-detected rather
 * than user-agent sniffed.
 *
 * Twelve milliseconds, at the floor of what hardware reproduces. Longer reads as a notification.
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
