# Flow review — October 16

Reviewed from `51afa90` with this commit’s changes. Required repository checks passed and the complete browser inventory was exercised through the existing CI shards. The final sharing shard and shared-view history checks were rerun after the URL subscription fix and passed.

The first complete local run exposed a clock setup race, fixed animation waits in functional checks, and a manual-copy field that disappeared when the view URL changed during resize. That initial run is not recorded as green.

A refused clipboard operation now leaves a selectable current link available while the same event remains selected, including after the viewport changes. The URL writer publishes same-document updates to a dedicated location subscription, so the field follows camera changes even with a fixed application clock. A camera URL change still invalidates the old “Link copied” success label. Selecting another event resets the control through its event key. The browser check verifies the field’s current value after desktop-to-phone resize and then retries copying successfully.

Functional map-scale, event-selection, section-opening and touch-hint checks use the supported reduced-motion path. Their numerical and focus assertions remain. The separate entrance, camera, gesture and real-time playback checks retain their animation coverage. Fixture event counts, test deadlines and retry settings were not loosened.

The readiness helper captures a positive numeric event count inside its existing retry budget. It avoids a second layout-dependent text read and rejects absent, empty or nonnumeric counts. The keyboard check freezes only its playback phase, verifies visible Play/Pause transitions and samples controlled elapsed time. Its pause instant is farther ahead than the test deadline, so a slow browser round trip cannot make it stale.

An earlier sharded sharing check also exposed a stale address and needed a retry. The strengthened camera-movement regression failed deterministically before the location subscription and passed repeated runs with retries disabled after it. The final sharing-shard rerun needed no retry.

The final keyboard scenario passed repeated runs with retries disabled. Disabling the comma handler first produced the expected numerical failure, and the source was restored. The other affected browser cases passed with retries disabled. Final repository checks and the complete browser inventory are validated using the existing six-shard CI configuration, sequentially on this computer.

Fresh sharing captures were inspected at 1440px and 390px. The iPhone-sized WebKit first-load check also passed. Physical keyboard, gestures, share-sheet delivery and spoken screen-reader output remain unverified. The review uses recorded local feeds and does not establish provider availability at another time.

- [Desktop manual copying](sharing-1440.png)
- [Phone manual copying](sharing-390.png)
