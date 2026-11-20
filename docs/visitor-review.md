# Visitor walkthrough

Use the deployed revision on an actual phone and desktop. Give a new visitor these tasks without
coaching; record where they hesitate and what they think the app is showing.

1. Explain what the dots represent and whether every source has answered. Find the data's time span.
2. Find an earthquake, open its details and compare the agencies' original magnitude readings.
3. Change the window or magnitude, then return to the default view.
4. On a phone, move between globe space and recent earthquakes. Open and dismiss the extra controls.
5. Copy a pinned-event link and reopen it in a different browser. Confirm the same view and event.
   Repeat for a flat map and held moment.
6. Make a still. Try successful sharing, cancellation, clipboard refusal and image download where supported.
7. Browse a completed UTC day. Move to its end, then return to live. Explain the coverage caveat
   for an early historical day.
8. Open a historical replay, pause and scrub it, and return to the globe. Repeat with Storm Radar
   and jump back to the latest scan. In After Dark, open and close Sun Watch.

Repeat the main path with keyboard navigation, reduced motion, larger text and a screen reader.
Check that Escape dismisses the innermost mobile controls before changing the selected view.
Try a slow or interrupted connection and WebGL disabled: the event list should remain useful.

Record the revision, device/browser, network conditions, task outcome, unexpected behavior and one
short quote in the visitor's words. Avoid collecting private locations or storing shared links with
personal notes. Real provider outages and native OS sheets need their own observations.

## Observation journeys

Use these checks after changes to the globe, story playback, search or Saved. Follow the same
reading from discovery through sharing and reopening. Check the deployed site on desktop and
a phone viewport, and keep screenshots and recordings outside Git.

### Keep a discovery and return to it

- **Keep two Float Dive samples.** Save two different depths from the same profile with
  different notes. Reload and reopen each at its own depth. Saving the same sample again updates
  that sample only. An observation saved before the change must still open with its note.
- **Return to the card that opened the story.** From partway down Saved, reopen a reading,
  inspect it and go Back. Restore the open collection, its scroll position and focus on the
  original card. Repeat from a search result and a layer to protect those return paths.
- **Recognize an already-kept reading.** Reopen a kept Tonga station minute. The action should
  acknowledge it is kept. Moving to another minute should show whether that minute is kept.
  The shared-link introduction should name the actions available in that phase, including for a
  screen reader. A recipient opens at the shared minute with playback paused.
- **Size Saved to its contents.** With one desktop card, fit the panel to that card. With two,
  make comparison easy. On a short phone, show the place, measured value and time before the
  chart. Check zero, one and several cards, a long station name, and removal followed by Undo.
- **Open Saved in one motion.** Try both a cold and a repeat opening. Show loading feedback
  when needed in the space the collection will occupy. Closing during loading should return
  focus to Saved and keep the collection closed when the request finishes.

### Tell the visitor what the evidence supports

- **Separate a pending check from a failed source.** Watch a healthy cold start, then
  interrupt only Tide Watch's NOAA request in an isolated browser. Keep the background-feed
  count accurate, identify the story source that failed, and make its Retry action recover
  the reading in place. A previous request must not change a story the visitor has since left.
- **Match date precision to the data.** Follow Vanishing Sea from its annual classification
  to its finding, saved view and shared link. Each should identify the selected year. Tonga's
  station readings still need their minute and time zone.
- **Find stories in everyday language.** Try “underwater” for Float Dive and “moon landing”
  for Moonfall. Keep existing results for “northern lights”, “Aral Sea” and “hurricane”.
  Check topic filters, a genuinely unmatched query, and the query and focused result after Back.

### Give the observation room on a phone

- **Leave sky visible in Tonight's Sky.** At 320 × 568, show the selected celestial body and
  current bearing together. Reveal the other directions on demand. Verify changing bearing and
  returning from Moonfall with touch and keyboard, at the same city and local time.
- **Let the finding lead at the end.** On a short phone, finish Vanishing Sea. Show the
  takeaway and its explanation together, with Replay within reach. Reopening playback should
  restore the timeline and keep the selected year. Check long findings and landscape too.

### Connect the cinematic moments to real observations

- **Float Dive.** At the end of the ascent, hold the surface position while the measured
  trace appears. Mark the depth the finding describes and name it on the save action. In the
  recorded example, the ascent ends at 3 m and the warmest sample is at 62 m. Derive both from
  the selected profile. Inspecting, sharing and reopening should agree about the selected sample.
- **Vanishing Sea.** Hold the camera while the early observed shoreline becomes legible
  against the final water extent. Label each period at its outline. Replay the comparison
  without restarting the journey. Keep missing observations distinguishable from dry land.
- **Landing globe.** Reveal one real observation's place and time when a visitor pauses over
  its marker, focuses it or taps it. Make opening the detail deliberate. Dragging must still
  orbit the globe. Dismissing the annotation should preserve the camera. Try a quiet area and
  overlapping markers before adding any permanent control.

### Verify across the whole visit

Run the affected paths in desktop and phone browsers, including a short phone and a landscape
view. Check both normal and reduced motion. Interrupt a transition with Back, switch projection
during inspection, and try rapid repeated input. Watch the camera, focused control, scroll
position and selected measurement together. Keep the same globe canvas throughout the visit.
On a cold load, check for controls moving under a pointer or a finger. On a return visit,
verify the actual saved value and note as well as the screen that opens. Distinguish browser
emulation from checks on physical devices when reporting results.
