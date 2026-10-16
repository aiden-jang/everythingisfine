# Event-panel simplification — October 16

Citation export was removed from earthquake and hazard panels, along with its formatter and tests for the removed export. The panels retain their facts and provider attribution. Pinned earthquakes keep the existing Copy link action, with a selectable URL when clipboard access is refused and retry using the current view.

The browser recovery journey now exercises actual link copying instead of citation formatting. Forced-color selection and keyboard-focus checks still cover the retained sharing control. The detail panel's source-size ceiling was lowered with the removed code.

Historical October 15 citation screenshots describe the earlier interface. This review records the current panel.

Repository verification gates passed, and the browser inventory ran across the existing six shards. The inventory audit confirmed that every case belongs to exactly one shard. The keyboard-transport case timed out in its batch and passed separately with the original assertions and time limit. The map-scale case passed on its existing retry. This was not a clean all-shards-green run.

The empty-link probe failed at the intended URL-value assertion. After restoring the reviewed source, both sharing and forced-color journeys passed. Desktop and phone captures were inspected. Native-device clipboard permissions and spoken screen-reader output were not tested.

- [Desktop clipboard recovery](trim-sharing-1440.png)
- [Phone clipboard recovery](trim-sharing-390.png)
- [Desktop forced colors](selection-1440-active.png)
- [Phone forced colors](selection-390-active.png)
