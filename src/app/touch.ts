/*
 * A tick in the hand when something is picked.
 *
 * On a phone the marks are a few pixels across and the pointer is a fingertip that covers them, so the
 * only confirmation a tap landed is the panel appearing a moment later. A short vibration closes that gap
 * before the eye does, which is the whole of what it is for.
 *
 * **On selection only, never on arrival, and that is a deliberate limit.** Buzzing a phone because an
 * earthquake happened is an alert, and an alert is something a person opts into: the sound already asks,
 * with a threshold and a toggle beside it. A tick that fires only when a finger just tapped needs no
 * consent because it cannot arrive uninvited, which is also why it needs no toggle in a key that already
 * has three.
 *
 * **Android only, in practice.** `navigator.vibrate` is unimplemented in Safari on iOS and always will be
 * as far as anyone has said, so this is silently absent on iPhone. Feature-detected rather than
 * user-agent sniffed, and it costs nothing where it is missing.
 *
 * Twelve milliseconds, which is at the floor of what hardware reproduces. Longer reads as a buzz and a
 * buzz reads as a notification; this is meant to feel like the mark had a surface.
 */

/** Short enough to read as contact rather than as a notification. */
export const TICK_MS = 12;

/**
 * Buzz once, if the device can.
 *
 * Wrapped because a `vibrate` call can throw rather than return false: some engines reject it outright
 * when the document has never been interacted with, and a picked marker must not be able to take the
 * panel down with it.
 */
export function tick(nav: Pick<Navigator, "vibrate"> | undefined = globalThis.navigator): void {
  try {
    nav?.vibrate?.(TICK_MS);
  } catch {
    // Nothing to fall back to, and nothing worth reporting: the panel opens either way.
  }
}
