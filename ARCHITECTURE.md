# Engineering constraints

[SYSTEM.md](SYSTEM.md) describes the current system and data flow. This reference
explains non-obvious constraints linked from source and tests. Follow the per-file
index to the matching implementation note.

**Files below.** Each is linked from the code by a `See ARCHITECTURE.md#anchor` note.

- [e2e/design.spec.ts](#e2edesignspects)
- [e2e/feeds.ts](#e2efeedsts)
- [e2e/interaction.spec.ts](#e2einteractionspects)
- [src/app/panelLift.ts](#srcapppanelliftts)
- [src/app/ArchiveControls.tsx](#srcapparchivecontrolstsx)
- [src/app/useStill.ts](#srcappusestillts)
- [src/App.tsx](#srcapptsx)
- [src/app/CrossSection.tsx](#srcappcrosssectiontsx)
- [src/app/DetailPanel.tsx](#srcappdetailpaneltsx)
- [src/app/Dial.tsx](#srcappdialtsx)
- [src/app/EventList.tsx](#srcappeventlisttsx)
- [src/app/MagnitudeFilter.tsx](#srcappmagnitudefiltertsx)
- [src/app/MarkCard.tsx](#srcappmarkcardtsx)
- [src/app/Resizer.tsx](#srcappresizertsx)
- [src/app/Sequence.tsx](#srcappsequencetsx)
- [src/app/Sizes.tsx](#srcappsizestsx)
- [src/app/Timeline.tsx](#srcapptimelinetsx)
- [src/app/age.ts](#srcappagets)
- [src/app/announce.ts](#srcappannouncets)
- [src/app/arrival.ts](#srcapparrivalts)
- [src/app/day.ts](#srcappdayts)
- [src/app/diurnal.ts](#srcappdiurnalts)
- [src/app/eclipseDays.test.ts](#srcappeclipsedaystestts)
- [src/app/eclipseDays.ts](#srcappeclipsedaysts)
- [src/app/feed.test.ts](#srcappfeedtestts)
- [src/app/feed.ts](#srcappfeedts)
- [src/app/felt.test.ts](#srcappfelttestts)
- [src/app/format.ts](#srcappformatts)
- [src/app/gutenberg.ts](#srcappgutenbergts)
- [src/app/hazards.ts](#srcapphazardsts)
- [src/app/histogram.ts](#srcapphistogramts)
- [src/app/marks.ts](#srcappmarksts)
- [src/app/nearby.perf.test.ts](#srcappnearbyperftestts)
- [src/app/nearby.ts](#srcappnearbyts)
- [src/app/notableDays.live.test.ts](#srcappnotabledayslivetestts)
- [src/app/notableDays.ts](#srcappnotabledaysts)
- [src/app/omori.ts](#srcappomorits)
- [src/app/permalink.test.ts](#srcapppermalinktestts)
- [src/app/permalink.ts](#srcapppermalinkts)
- [src/app/viewLocation.ts](#srcappviewlocationts)
- [src/app/useGlobeResources.ts](#srcappusegloberesourcests)
- [src/app/useGlobeTour.ts](#srcappuseglobetourts)
- [src/app/regions.ts](#srcappregionsts)
- [src/app/replay.test.ts](#srcappreplaytestts)
- [src/app/replay.ts](#srcappreplayts)
- [src/app/roll.ts](#srcapprollts)
- [src/app/scrub.ts](#srcappscrubts)
- [src/app/search.test.ts](#srcappsearchtestts)
- [src/app/search.ts](#srcappsearchts)
- [src/app/section.test.ts](#srcappsectiontestts)
- [src/app/section.ts](#srcappsectionts)
- [src/app/sound.ts](#srcappsoundts)
- [src/app/still.ts](#srcappstillts)
- [src/app/stored.ts](#srcappstoredts)
- [src/app/superlative.ts](#srcappsuperlativets)
- [src/app/touch.ts](#srcapptouchts)
- [src/app/tour.ts](#srcapptourts)
- [src/app/useNarrow.ts](#srcappusenarrowts)
- [src/app/versus.ts](#srcappversusts)
- [src/app/viewer.ts](#srcappviewerts)
- [src/app/windows.ts](#srcappwindowsts)
- [src/data/baseline.ts](#srcdatabaselinets)
- [src/data/depth.ts](#srcdatadepthts)
- [src/data/filter.test.ts](#srcdatafiltertestts)
- [src/data/filter.ts](#srcdatafilterts)
- [src/data/fixtures.ts](#srcdatafixturests)
- [src/data/reconcile.test.ts](#srcdatareconciletestts)
- [src/data/reconcile.ts](#srcdatareconcilets)
- [src/data/store.test.ts](#srcdatastoretestts)
- [src/data/store.ts](#srcdatastorets)
- [src/data/types.ts](#srcdatatypests)
- [src/geo/antipode.ts](#srcgeoantipodets)
- [src/geo/boundaryDistance.test.ts](#srcgeoboundarydistancetestts)
- [src/geo/boundaryDistance.ts](#srcgeoboundarydistancets)
- [src/geo/eclipse.test.ts](#srcgeoeclipsetestts)
- [src/geo/eclipse.ts](#srcgeoeclipsets)
- [src/geo/figures.test.ts](#srcgeofigurestestts)
- [src/geo/land.test.ts](#srcgeolandtestts)
- [src/geo/land.ts](#srcgeolandts)
- [src/geo/moon.test.ts](#srcgeomoontestts)
- [src/geo/moon.ts](#srcgeomoonts)
- [src/geo/planets.test.ts](#srcgeoplanetstestts)
- [src/geo/planets.ts](#srcgeoplanetsts)
- [src/geo/plateMotion.ts](#srcgeoplatemotionts)
- [src/geo/plates.test.ts](#srcgeoplatestestts)
- [src/geo/plates.ts](#srcgeoplatests)
- [src/geo/slab.test.ts](#srcgeoslabtestts)
- [src/geo/slab.ts](#srcgeoslabts)
- [src/geo/sphere.test.ts](#srcgeospheretestts)
- [src/geo/sphere.ts](#srcgeospherets)
- [src/geo/stars.test.ts](#srcgeostarstestts)
- [src/geo/stars.ts](#srcgeostarsts)
- [src/geo/sun.ts](#srcgeosunts)
- [src/geo/waves.ts](#srcgeowavests)
- [src/globe/Globe.tsx](#srcglobeglobetsx)
- [src/globe/auroraTexture.ts](#srcglobeauroratexturets)
- [src/globe/cluster.ts](#srcglobeclusterts)
- [src/globe/controls.ts](#srcglobecontrolsts)
- [src/globe/events.perf.test.ts](#srcglobeeventsperftestts)
- [src/globe/events.ts](#srcglobeeventsts)
- [src/globe/figures.ts](#srcglobefigurests)
- [src/globe/marks.ts](#srcglobemarksts)
- [src/globe/moon.ts](#srcglobemoonts)
- [src/globe/morph.ts](#srcglobemorphts)
- [src/globe/planets.ts](#srcglobeplanetsts)
- [src/globe/ramp.ts](#srcgloberampts)
- [src/globe/rings.ts](#srcgloberingsts)
- [src/globe/scale.ts](#srcglobescalets)
- [src/globe/scene.ts](#srcglobescenets)
- [src/globe/shapes.ts](#srcglobeshapests)
- [src/globe/sink.test.ts](#srcglobesinktestts)
- [src/globe/sky.ts](#srcglobeskyts)
- [src/globe/slab.ts](#srcglobeslabts)
- [src/globe/starfield.ts](#srcglobestarfieldts)
- [src/sources/archive.ts](#srcsourcesarchivets)
- [src/sources/aurora.ts](#srcsourcesaurorats)
- [src/sources/contract.ts](#srcsourcescontractts)
- [src/sources/cyclones.ts](#srcsourcescyclonests)
- [src/sources/emsc.live.test.ts](#srcsourcesemsclivetestts)
- [src/sources/emsc.test.ts](#srcsourcesemsctestts)
- [src/sources/emsc.ts](#srcsourcesemscts)
- [src/sources/floods.ts](#srcsourcesfloodsts)
- [src/sources/gdacs.ts](#srcsourcesgdacsts)
- [src/sources/history.live.test.ts](#srcsourceshistorylivetestts)
- [src/sources/history.ts](#srcsourceshistoryts)
- [src/sources/types.ts](#srcsourcestypests)
- [src/sources/usgs.live.test.ts](#srcsourcesusgslivetestts)
- [src/sources/usgs.ts](#srcsourcesusgsts)
- [src/sources/volcanoes.ts](#srcsourcesvolcanoests)
- [src/sources/wildfires.ts](#srcsourceswildfirests)


### e2e/design.spec.ts

**DESIGN.md section 13, as tests rather than as a list. An audit performed once is worth ver**

DESIGN.md section 13, as tests rather than as a list. An audit performed once is worth very little:
two of these rules were broken by accident during the build and neither by a decision.

The rules that can be asserted are; the ones that need eyes are named at the bottom.

**Chroma of every colour the chrome paints, measured from the rendered page. The canvas is e**

Chroma of every colour the chrome paints, measured from the rendered page. The canvas is excluded,
because that is where hue belongs.

Absolute chroma, not HSV saturation. `Deck` is `#0D1420`, whose channels differ by 19 of 255, and
relative saturation calls that 0.59 because the colour is nearly black.

**Left to eyes, deliberately. These are the section 13 rules a computer cannot judge:**

Left to eyes, deliberately. These are the section 13 rules a computer cannot judge:

  - whether the globe reads as an instrument rather than a placeholder at tweet size;
  - whether the wavefront reads as arriving rather than decorating;
  - whether the copy contains a claim the data does not support.

**The rail cannot hold everything at once. With the timeline in it the column runs about 600**

The rail cannot hold everything at once. With the timeline in it the column runs about 600px past a
900px screen, so the event list sits below the fold and you scroll to it - deliberate, because the
alternative was pushing the transport under, and that one has regressed twice.

What must never happen is the list being unreachable: clipped by a parent that does not scroll.

### e2e/feeds.ts

**Both feeds, served from the test**

Both feeds, served from the test.

Talking to USGS and EMSC for real was the one thing keeping this suite out of CI: none of these tests
assert anything about the data, so they time out waiting for content and a quiet network looks exactly
like a broken app.

Deterministic and positioned relative to now, or fixed timestamps age out of the window and the suite
rots quietly. The live contract is still checked, by `pnpm test:live`.

**Held just under the magnitude that spawns a wavefront, and derived rather than written dow**

Held just under the magnitude that spawns a wavefront, and derived rather than written down.

A ceiling above `REPLAY_FRONT_MIN_MAG` lets the entrance replay fire fronts, each of which keeps the
frame loop awake about sixteen seconds: three tests went from roughly 20 seconds to 40, 45 and 66,
straight through the budget, with nothing wrong with the app or the tests.

The cost is that no browser test ever sees a wavefront. That was already true and is now at least
visible.

**A day of seismicity, newest last, drawn from Gutenberg-Richter. A uniform draw would put a**

A day of seismicity, newest last, drawn from Gutenberg-Richter. A uniform draw would put a magnitude
7 on screen every few minutes and quietly make every magnitude filter test meaningless.

The slope matters because the app reads it back: the size-distribution chart estimates b from these
events and quotes it. Measured across four seeds, this draw gives a largest of M4.4 to M4.9 and an
estimated b of 0.87 to 0.95, inside the 0.8 to 1.2 real catalogues sit in.

Don't tune the draw to make the readout land on a rounder number. The gap is the ceiling above cutting
the upper tail, and fooling the estimator is the same dishonesty in the other direction.

**Routes both feeds and stubs the socket. Call before page.goto**

Routes both feeds and stubs the socket. Call before `page.goto`.

The socket has to be stubbed rather than routed: `page.route` never sees a WebSocket, which is how a live
earthquake from Salta turned up in a test that had carefully routed both HTTP endpoints to nothing.

**The archive asks fdsnws/event/1/query?format=geojson&..., which contains no literal .geojs**

The archive asks `fdsnws/event/1/query?format=geojson&...`, which contains no literal `.geojson`, so
it missed every pattern here and reached the real internet for months.

These fixtures are dated inside the requested day: an archived day whose events are dated today cannot
tell a correct clock from a broken one.

**Waits for the rail's counter to leave zero, which is the app's own "data has landed" signa**

Waits for the rail's counter to leave zero, which is the app's own "data has landed" signal.

The rail is asserted first, on a short timeout, because `not.toHaveText` against an element that does not
exist spends the full thirty seconds and then reports "element(s) not found".

**The hazard feeds. Unstubbed they cost 14 requests to gdacs.org and 2 to swpc.noaa.gov per **

The hazard feeds. Unstubbed they cost 14 requests to gdacs.org and 2 to swpc.noaa.gov per test, about
a thousand a run, for data no test asserts on.

Small fixed sets rather than empty replies, so screenshots keep showing a spiral, a triangle, a flame
and waves, and the same ones every run.

### e2e/interaction.spec.ts

**The one claim written down since step 3 and never observed**

The one claim written down since step 3 and never observed.

The context is built explicitly rather than through `test.use({ reducedMotion })`, which silently did not
reach the page in this Playwright version: `matchMedia` reported false inside a block named "with reduced
motion", and the behavioural assertions passed anyway. So the emulation is asserted first.

**Two bugs in one state. DESIGN.md 6 specifies a hairline notice naming the source and the r**

Two bugs in one state. DESIGN.md 6 specifies a hairline notice naming the source and the retry, and
`SourceStatus` carried both while nothing read them.

Worse, coverage was inferred from the first delivery carrying events: with the seed requests dead and two
stray socket pushes arriving, the rail read "0 events, last 24 hours".

**Double the budget, because this test costs about a full one**

Double the budget, because this test costs about a full one.

A passing run measures 45.5s against the default 45s, so it sat exactly on its own ceiling and flipped
with the weather: the projection toggle read `""` because the test was killed mid-assertion, not because
anything errored. An entrance to wait out, two 2.5s morphs, and two WebGL canvas screenshots.

**Arrow keys, not just a pointer. Shift is the coarse step**

Arrow keys, not just a pointer. Shift is the coarse step.

Backed off the ceiling first, because the drag above does not land on a fixed value: anything that
shortens the rail pushes the result up, and at `max` the arrows measure the clamp rather than the step.

**A section survives being sent to somebody. It carries its own view, which no other field d**

A section survives being sent to somebody. It carries its own view, which no other field does: a section
has nowhere to be drawn except the map.

Started from a fresh context with the map turned off in storage, since the interesting case is a recipient
whose own preference disagrees with the link.

**The app opens on the present, which at a wide window is the least interesting moment it ho**

The app opens on the present, which at a wide window is the least interesting moment it holds. The rail
already named the strongest event and flew to it, and left the cursor live.

Built from exact features rather than the plausible day: a fixture whose strongest event happened four
minutes ago would pass every assertion below while testing nothing.

**The two ways the panel moves the camera, and the fact that they pull opposite ways. Openin**

The two ways the panel moves the camera, and the fact that they pull opposite ways. Opening it flies to the
epicentre; "Far side" draws five circles spanning the planet, so it has to pull back. A regression giving
them the same zoom leaves both apparently working.

Pinning used to need a "Fly here" press. It flies on its own now, which is the same assertion with the
button taken out: a pin that does not move the camera puts the answer on screen and the subject off it.

**Guards two separate bugs that together made earthquakes untappable**

Guards two separate bugs that together made earthquakes untappable.

The globe reports a hit as `onSelect(quake)` then `onSelectMark(null)`, and `selectMark` used to clear
the selection whichever way it was called, so the second call undid the first. And a magnitude 2 marker
is 3px across against 4px of slop, so a finger was aiming at a 7px circle while marks had 18.

**Where a pinned event lands on a phone, which is a question with a bar at one end and a she**

Where a pinned event lands on a phone, which is a question with a bar at one end and a sheet at the
other. Two separate errors used to put it 6px under the top bar on a short phone, nearly cancelling
each other into something that looked deliberate: the lift was converted with `degPerPx`, which is the
flat map's straight line rather than the sphere's curve, and it was converted at the zoom the flight
started from rather than the one it ends on.

### src/App.tsx

**Keep this above every memo that calls it. Below them it is a temporal dead zone: tsc passe**

Keep this above every memo that calls it. Below them it is a temporal dead zone: tsc passes, the
build passes, and the page renders nothing.

The memos call this rather than depending on `now`, which changes every render and would re-sweep
fifty thousand events a second.

**Hidden while an archived day is up, or today's storms are drawn over July's earthquakes**

Hidden while an archived day is up, or today's storms are drawn over July's earthquakes.

Hidden and not backdated because there is nothing to backdate to: GDACS lists cannot be queried by
date. So this is an earthquake archive, which is what the banner says.

**In archive mode this is the end of the archived day, not the wall clock**

In archive mode this is the end of the archived day, not the wall clock.

Everything here filters on "the last N hours before now", so against the wall clock an archived day
filtered to nothing: 702 events in the store and a headline of 0. The cost is that "3h ago" means
that day, which is why the banner naming the date matters.

**Never overwrite a hash this app did not write**

Never overwrite a hash this app did not write.

Pasting a link queues a `hashchange` the handler below reloads on. Land a write in between and the
app's own state goes back over the pasted link, the handler sees no change, and the link is
swallowed. Caught as a 1-in-6 flake in the shared cross-section test.

The guard is here and not at the three call sites because the rule is about the writer, not about
who asked.

**How far above the middle a pinned event should sit, so the sheet describing it does not co**

How far above the middle a pinned event should sit, so the sheet describing it does not cover it.

Zero on a desktop, measured rather than assumed: the rail takes 356px on the left and the panel 360
on the right, so the free middle and the canvas middle are two pixels apart.

**Where the sheet's top edge will be, worked out rather than measured: the first pin is the **

Where the sheet's top edge will be, worked out rather than measured: the first pin is the one that
opens it, so there is nothing to measure yet. Lifting by half the height it covers puts the middle
of what is left where the camera's middle was.

Do not go back to a fraction of the canvas. Twice tried: the bar is the same size on every phone
and the canvas is not, so a quarter of a short one put the event 6px under the bar.

**Twenty ticks a second, not one a frame: every tick re-renders the rail and re-syncs the ev**

Twenty ticks a second, not one a frame: every tick re-renders the rail and re-syncs the event layer.

Step by measured time, never by the interval asked for. Each tick drags a React render behind it, so
it fires late and a twelve second window took past fourteen.

**Both panels on one rung, cleared without being read**

Both panels on one rung, cleared without being read.

They share a slot, so at most one is open and clearing both is exact. Reading `markId` here
instead would need it in the dependency list, and the listener would go on closing over the
value it was armed with: escape did nothing to a mark card for exactly that reason.

**The store hands events back in arrival order, which is right for eviction and wrong for a **

The store hands events back in arrival order, which is right for eviction and wrong for a list
headed "newest first". Sorting the 400 most recently arrived was silently wrong once a month's seed
became eleven thousand: USGS lists newest first, so the last 400 to arrive are the oldest.

The store takes the filter too, so a cap can never throw away the answer before filtering.

**The count in the tab, so leaving the page open is worth something. Not during the replay: **

The count in the tab, so leaving the page open is worth something.

Not during the replay: the count climbs through a whole day in 2.8 seconds, which is a flickering tab
rather than a readout, and it is showing yesterday anyway.

An archived day says which day, or the tab reads as a live figure for a date chosen hours ago.

Number first, because a tab is truncated from the right.

**A shared cursor the window cannot hold, or the recipient sees the present with no reason w**

A shared cursor the window cannot hold, or the recipient sees the present with no reason why.

Compare against the shared value, not `view.at === null`. That test catches only the future branch;
a moment older than the window is pinned to `span.from`, still held, just not where the link asked -
which is the common case and the silent one.

**The ranking ignores the magnitude filter on purpose - one a reader can change by dragging **

The ranking ignores the magnitude filter on purpose - one a reader can change by dragging a slider
is worse than none - but it must still stand down when the filter empties the screen. M7 against a
largest of 4.9 left the headline at 0 and this line claiming "5 at M4.5+".

On `revealedNow ?? shown`, which is what the headline itself prints, or a parked cursor put "103 at
M4.5+" under a headline reading 0.

**Sized to their labels, not to the panel. flex-1 gave each half the key's width, making two**

Sized to their labels, not to the panel. `flex-1` gave each half the key's width,
making two secondary filters the heaviest things in it.

Pressed is `border-faint`, matching the detail panel and the window buttons. On
hover instead, the state you were about to enter looked like the state you were in.

**Counts what is on the globe, so during the replay it climbs as the day plays in**

Counts what is on the globe, so during the replay it climbs as the day plays in.

Rolled only when the change is discrete. The replay and a parked cursor already climb it a frame at a
time and there it has to be exactly what is drawn; what was left snapping is a live arrival and a
window change from 872 to 11,363.

**Which moment the light is of. clockAt is the app's answer to what time is on screen, and a**

Which moment the light is of. `clockAt` is the app's answer to what time is on screen, and a
held cursor overrides it with the same precedence `stillMoment` uses, so the terminator and the
caption cannot disagree.

Null on the live view rather than a timestamp, so the scene keeps its minute throttle instead
of re-aiming the sun every render for a change no eye could see.

**Fixed to the rail's edge, and never moved by a panel**

Fixed to the rail's edge, and never moved by a panel.

It used to inset its right edge whenever one opened, which kept it clear but slid every piece
of it sideways each time somebody pinned an event. Pinning the width alone would not do: the
band was right-aligned, so a 380px panel covered the legend outright.

So the contents sit against the left edge instead - which is the rail, and a panel opening does
not move the rail. Nothing overlaps, and nothing shifts.

**The one thing in this band that still yields to a panel**

The one thing in this band that still yields to a panel.

The band is pinned so the legend and the hints never slide, and everything else in it is
left-aligned and narrow enough that a panel cannot reach it. This is a drawing that spans
the full width, and a panel over it hides a fifth of the section - so it keeps the inset the
band gave up, as padding of its own.

**Both keep the same py-1.5, or their two lines of text sit on different baselines**

Both keep the same `py-1.5`, or their two lines of text sit on different baselines.

Below `md` the credit stays in the flow: the chip is the full width of the band there, and out
of the flow the two are drawn on top of each other.

### src/app/CrossSection.tsx

**The crust seen from the side: distance across, depth down, drawn at 1:1. Never stretch the**

The crust seen from the side: distance across, depth down, drawn at 1:1.

Never stretch the depth axis quietly. The dip of the slab is the whole content, and stretching invents a
steeper one. When 1:1 will not fit - a 3,700km line against 150km of depth is four pixels tall - stretch
it and print the factor, so a reader can undo it.

**The floor is taller where the panel is narrow, because these units are a fraction of its w**

The floor is taller where the panel is narrow, because these units are a fraction of its width. At 96
units the rendered height is 110px on a desktop panel and 37px on a 390px phone, where the 9.5px depth
labels land nine pixels apart and collide.

Raising the floor rather than hiding the labels: the exaggeration this costs is already printed in the
header, and hiding the labels would remove the thing that makes the axis readable.

### src/app/DetailPanel.tsx

Pinned event times show the viewer’s full local date and UTC offset. `EventTime.tsx`
keeps the machine-readable instant alongside the label. The offset distinguishes repeated
clock times when daylight saving ends; each provider’s compact time retains the full title.

**The pinned event, in full**

The pinned event, in full.

This panel was 81% empty, because it only ever said what one feed reported and for 94% of events only
one feed reported. The project's whole subject - two agencies disagreeing - was invisible on almost
every event a person could click. So it answers the questions a reader actually has, from data already
held: how deep, what else happened around it, how far apart the two agencies put it, and how to share it.

**How many people said they felt it, and how hard. The only human number in this app**

How many people said they felt it, and how hard. The only human number in this app.

Say "reported", never "felt". "Did You Feel It" is self-selected, so it counts where people live and
whether they went online afterwards.

Round the intensity to a whole step. A community-determined 3.9 is an average of what people ticked on a
form, not a measurement to a tenth.

**Recomputed on new data, not on the clock**

Recomputed on new data, not on the clock.

This walks the whole buffer, and the panel re-renders every second because the rail's clock ticks:
measured in a swarm at a full buffer, 56ms every second for an answer that had not changed.

`now` is read inside and is deliberately not a dependency. Entering or leaving an archived day moves
the revision anyway, since the store is cleared and refilled.

**Only when somebody reported. This app cannot tell "nobody felt it" from "nobody wrote in",**

Only when somebody reported. This app cannot tell "nobody felt it" from "nobody wrote in", and
only the second is a thing it knows. USGS only: EMSC runs its own system and does not put it in
the feed this reads.

Labelled "Felt reports", not "Reported", which sat two rows above "Reported by - USGS".

**What the sky was doing there when it happened. An M6 at three in the morning is a differen**

What the sky was doing there when it happened. An M6 at three in the morning is a different event
from the same rupture at three in the afternoon.

Solar time, not clock time, and that is the keyless answer rather than a lazy one: civil time
needs timezone boundaries, and this needs the sun. Labelled "solar" so nobody reads it as what a
watch there would have said. At the event's own origin, not at `now`.

**The relay, and in brackets whoever actually computed it. Both feeds aggregate: a Hawaiian **

The relay, and in brackets whoever actually computed it. Both feeds aggregate: a Hawaiian
earthquake reported by USGS was solved at the Hawaiian Volcano Observatory.

Here rather than in the comparison table, which is already four columns in a 300px panel.

**When it reached the nearest place with a name on it. A marker says an earthquake happened **

When it reached the nearest place with a name on it. A marker says an earthquake happened at a
point; it does not say the point is 7km from a town that felt it two seconds later.

The distance and the town are the agency's own words, parsed out of "38 km NW of Stanton, Texas".
Nothing is authored: a list of cities written from memory would make confident claims about real
towns from latitudes a tenth of a degree out, and a tenth of a degree is two seconds. Absent when
the agencies named only a region, because a centroid would be that same invention.

**Walking the sequence, which was the missing half of the strip: you could read the shape of**

Walking the sequence, which was the missing half of the strip: you could read the shape of a
swarm and not visit it.

Labelled with the neighbour's magnitude rather than "previous" and "next", because the useful
question in a swarm is how big the next one was. Hidden at either end rather than disabled:
a dead control is a question.

**A seam, because the fourth button is not the same kind of thing as the first three. Fly, S**

A seam, because the fourth button is not the same kind of thing as the first three. Fly, Slice and
Far side move the camera; Copy link changes nothing on screen.

`ml-auto` rather than a separator: this row wraps, and a divider landing at the end of a line is
an orphan. Not a wrapper either - grouping the first three would push them past the edge of a
phone as one unsplittable item.

### src/app/Dial.tsx

**The window folded onto a 24-hour dial. Behind a disclosure because its payload is a null r**

The window folded onto a 24-hour dial. Behind a disclosure because its payload is a null result:
interesting once, and not something anybody monitors.

See `diurnal.ts` for why the bins are local solar time and why no verdict is printed.

### src/app/EventList.tsx

**The list of recent events. One list, for everybody**

The list of recent events. One list, for everybody.

This was two things: a visible globe and a screen-reader-only list carrying strictly more information
than any sighted person could reach. It is visible now and still the same list a screen reader gets:
same order, same content, one tab stop then arrow keys, selection shared with the globe.

**The live region, gated by magnitude and by the clock**

The live region, gated by magnitude and by the clock.

A busy feed delivers hundreds of events an hour, and announcing all of them floods a screen reader.
The default threshold is deliberately high: silence that can be lowered is recoverable.

See `announce.ts` for the clock half: an event being new to this list is not the same as it being new.

**A floor under the list, because flex-1 gives zero when there is nothing left to give**

A floor under the list, because `flex-1` gives zero when there is nothing left to give.

When the rail scrolls, `flex-1` resolved this section to height 0: the rows hung outside a zero-height
box, below the rail's scrollable extent, so nothing could bring them into view. `min-h-0` is still
what lets the scrollport shrink below its content; it just must not shrink to nothing.

**A share of the viewport in the two single-column layouts, not just a floor**

A share of the viewport in the two single-column layouts, not just a floor.

`flex-1` cannot help here: that column is over-subscribed, so there is no free space for a grow
factor to claim and this stayed at its 8.25rem floor - measured at 0% visible at 1440x900, every
earthquake in the app below the fold. Between 768 and 1279 the grid gives it a column of its own
and the floor is all it needs.

### src/app/MagnitudeFilter.tsx

**One row of the key: a glyph, the line that names it, and the reasoning one press away**

One row of the key: a glyph, the line that names it, and the reasoning one press away.

`details` rather than a button and state: natively focusable, so the row stays reachable without a
keyboard path being invented for it, and it matches the two disclosures the rail already uses.

**The legend and the magnitude filter, which were two blocks and are one control**

The legend and the magnitude filter, which were two blocks and are one control.

They were always about one quantity: the legend says what the colours mean and the filter says which
of them to draw. Running the slider along the ramp makes the track the scale and the thumb the
threshold, so neither half needs a label explaining the other.

**Which half to draw**

Which half to draw.

`controls` is the ramp, the feeds and the layers; `key` is the explanation of every mark. They render
in different places - the rail and a panel of its own - so this splits rather than hides: two copies
with one hidden would put a second `#mag` in the accessibility tree.

**Everything below the scale is explanation and folds away. Controls above, commentary below**

Everything below the scale is explanation and folds away. Controls above, commentary below.

Open by default. Remember only that somebody closed it: folding it shut out of the box would hide
the argument from everyone who never finds the toggle.

`preventDefault` on the summary so React owns `open`. React 18 does not listen for `toggle`, so the
browser's own state cannot be read back, and this state is persisted.

**The rings were the one mark nothing named. A ring appears when an event arrives, expands f**

The rings were the one mark nothing named. A ring appears when an event arrives, expands for fifteen
seconds and is gone, so a first-time viewer gets one look at it.

A sentence rather than a label, because the multiplier is part of what the mark is: a wavefront moving
at twenty times real speed with nothing saying so would be the one dishonest thing here.

`items-start`, since this is the only row that wraps and a glyph centred against two lines floats.

**Required, not optional: a dark patch appearing on the planet with nothing naming it is the**

Required, not optional: a dark patch appearing on the planet with nothing naming it is the exact
case this panel's rule exists for. Conditional like the storms, so it costs nothing on the days -
almost all of them - when there is no shadow.

It bounds its own claim. The position comes from an abridged lunar series through sixty Earth radii
of lever arm, so it is good to a few hundred kilometres and a shadow that looked precise would be
the one mark here somebody might plan around.

**Both rows say the fact a viewer would otherwise get wrong**

Both rows say the fact a viewer would otherwise get wrong. Nobody expects a real catalogue behind a
globe of earthquakes, and the moon looks like a speck because that is the size the moon is - the
familiar enormous one is a long lens, so the sentence has to say "real size" or the layer reads as
a bug.

The phase went out of that line rather than wrapping onto a second row: a crescent explains itself
once it is a crescent, and the smallness is the part that needs defending.

**Feeds and layers fold, because they are set once and then never touched, and the rail is s**

Feeds and layers fold, because they are set once and then never touched, and the rail is short by
about 400px with the timeline back in it. The ramp above stays open - that one gets dragged.

Layers live here rather than in the key, where they used to be: turning the slab on meant opening
a fold titled "What the marks mean", which is not where anybody looks for a control.

### src/app/MarkCard.tsx

**What a storm, volcano, fire or flood says when you click it. Not the earthquake panel. Tha**

What a storm, volcano, fire or flood says when you click it.

Every line is a fact from the feed. If the feed does not carry something, drop the row - never show a dash.

Not the earthquake panel. That one is built around two agencies disagreeing, and a wildfire has no depth,
no neighbours, no arrival time and no sequence.

**The rows for a subject, as facts. Split out from the markup so it can be asserted without **

The rows for a subject, as facts. Split out from the markup so it can be asserted without a DOM.

`archived` moves the tense. These notes read "running now" and "burning now", which was safe only while
an archived day withheld the four layers: now a card opened on 2026-05-15 would call a fire that ended
in May a fire burning this minute.

### src/app/Resizer.tsx

**A draggable edge, horizontal or vertical**

A draggable edge, horizontal or vertical.

Both sides of every edge want the space, and which one wants it more depends on what somebody is doing.

One component for both axes, because the accessible part is worth having once: a `separator` with
`aria-valuenow` and arrow keys. A splitter that only answers a mouse is a control a keyboard user can see
and cannot touch.

### src/app/Sequence.tsx

**The pinned event inside its own sequence**

The pinned event inside its own sequence.

One axis, time, with the pinned event fixed at its true position and every neighbour as a tick. Overlap is
not a defect: three hundred ticks piling into ninety minutes is the shape of a swarm, which is exactly
what the globe cannot show because clustering collapses it to one marker.

### src/app/Sizes.tsx

**How many earthquakes at each size, log up the side. Ten times as many, each magnitude down**

How many earthquakes at each size, log up the side. Ten times as many, each magnitude down, since 1944.

Draw nothing else. The two things a reader has to see are that the points are straight and where they
stop being straight.

The bend at the left is about us, not the Earth: below that size the network stopped hearing them. The
sentence underneath has to say so.

### src/app/Timeline.tsx

**The window as a strip of bars, with the transport under it**

The window as a strip of bars, with the transport under it.

The scale is the track, like the magnitude filter: the histogram is the legend and the thumb is the edge.

Name the window, never drag it. As a slider the strip showed a day and the globe showed part of it - the
two views disagreeing by construction - and it fixed a bar at an hour, which caps the window.

**True before any feed has vouched for the window, so an empty strip is not blamed on the fi**

True before any feed has vouched for the window, so an empty strip is not blamed on the filters.

`fetching` is not this: that is a pending window change, so at first paint it is false while the strip
is genuinely empty, and the readout would claim nothing matched when nothing had arrived.

**What one bucket is, named the way bucketAgo names a distance**

What one bucket is, named the way `bucketAgo` names a distance.

`BUCKETS` is fixed at 24 and the window is 24h, 7d or 30d, so a bucket is an hour on exactly one of the
three. Two strings here said "hours" flatly, which made both wrong on two windows out of three.

**The bars are real buttons, so holding an hour is not mouse-only**

The bars are real buttons, so holding an hour is not mouse-only.

Focus is the hold, so there is no second state to keep in step with the pointer's. One tab stop for the
whole strip on a roving `tabIndex`: twenty-four tab stops in front of the rail would be a worse barrier
than the one this removes.

`STRIP_PX` is 44, exactly the touch minimum, so this costs no layout.

**The notable events, over the bars they belong to**

The notable events, over the bars they belong to.

`pointer-events-none`, so the bar underneath still takes the click. The bars stop at 39px inside a
44px strip, and this sits in that gutter rather than costing the rail another row.

**How far back each feed reaches, against the axis above it**

How far back each feed reaches, against the axis above it.

The catalogue returns its most recent page whatever is asked of it, so at a month USGS vouches for
thirty days and EMSC for eighteen hours. Widening the window widens one bar and not the other.

Anchored right, because coverage reaches back from now. Both tracks are on screen from the first
frame, empty, so the load state and the steady state are one picture.

### src/app/age.ts

**How old a hazard is, and whether the window keeps it. Don't judge these on iscurrent: GDAC**

How old a hazard is, and whether the window keeps it.

Don't judge these on `iscurrent`: GDACS flags a three-week-old fire as burning, so a currency filter
governs one layer and not the others. Every layer is judged on its own date instead - storms, fires and
floods on their start, volcanoes on their episode end.

### src/app/announce.ts

**What counts as news, for the one interface that speaks**

What counts as news, for the one interface that speaks.

Decide by the clock, never by "have I shown this before". On a cold load the list goes from empty to sixty
at once and every one is unseen, so a screen reader was told "3 new earthquakes" about a backlog hours old.
Lowering the magnitude filter did the same thing.

**How recently an event must have happened to be worth announcing**

How recently an event must have happened to be worth announcing. Agencies publish within a few minutes for
anything large and up to fifteen for the rest, so this has to be wider than the publishing delay.

The trade is explicit: an event published unusually late passes unannounced. That is the recoverable
direction; the other floods somebody's screen reader on every page load.

### src/app/arrival.ts

**When the shaking reached the nearest named place**

When the shaking reached the nearest named place.

The distance is the agency's, never ours. USGS writes every place as "38 km NW of Stanton, Texas". An
authored list of cities means latitudes written from memory, and a tenth of a degree is 11km, which is
two seconds of an answer that reads as measured.

Straight line at crustal speed, so it is capped: past that the wave dives into faster mantle and arrives early.

**Path length from the hypocentre to the place, which is not the distance on the map**

Path length from the hypocentre to the place, which is not the distance on the map. The published figure
is epicentral; the wave leaves from depth, so the path is the hypotenuse - at a 45km-deep event 40km away
that is 60km, and ignoring it understates the arrival by a third exactly where it matters most.

A missing depth counts as zero, following the event layer's convention. It biases the arrival early.

**Distance between two events, and how long the first one's P wave took to reach the second**

Distance between two events, and how long the first one's P wave took to reach the second.

Distance always, time only inside `MAX_KM`. Distance is geometry and true at any separation; a constant
crustal velocity stops being true well before the antipode.

No depth correction here. Both ends are hypocentres, and the honest path between them is a refracted ray
rather than the surface arc or the chord.

### src/app/day.ts

**What counts as a day this app can load. Every path asks this one function**

What counts as a day this app can load. Every path asks this one function.

The rule used to live in three places, one of them a browser widget: the date field relied on `max`, so
Chrome was enforcing the ceiling for anything typed.

"Has ended", not "is before now". `at < Date.now()` accepts today, and a banner reading "all day UTC"
over a day still in progress is the one claim the archive must not make.

**What the viewer typed, as far along an ISO day as it has got**

What the viewer typed, as far along an ISO day as it has got.

Every date on screen here is ISO, so the field asks for what the app shows and a date can be copied out
of the notable list and pasted straight in.

Digits are the input and the hyphens are ours, which is what makes backspace behave: the value is rebuilt
from the digits every keystroke, so deleting into a hyphen removes the digit before it.

### src/app/diurnal.ts

**Counts events by hour of day, on a 24-hour dial. Earthquakes have no time of day, so this **

Counts events by hour of day, on a 24-hour dial. Earthquakes have no time of day, so this shows nothing.

Bin on solar time at each epicentre, never UTC. UTC smears a real signal across every longitude and
flattens it, so the dial would come out flat whether or not anything was there.

Draw the noise band: 400 events in 24 bins is 17 each give or take 4, and bars wobbling by a quarter look
like a signal. Never print a verdict - with 24 bins, one strays past two sigma by luck alone.

**The dial's finding, as a number, or null when there is none**

The dial's finding, as a number, or null when there is none.

Say the number. `worst` was computed and tested and never drawn, so it reached nobody who could not read a
ring against a band by eye, and nobody at all through a screen reader.

A number and no word. With 24 bins one strays past two sigma by luck, so any verdict is wrong a third of
the time.

### src/app/eclipseDays.test.ts

**The point of this file: every row is checked against the same geometry the globe draws wit**

The point of this file: every row is checked against the same geometry the globe draws with.

These dates and minutes were written from memory, and a wrong one fails silently in the app - the day
loads, the cursor moves, and there is simply no shadow. So the table is not trusted. If a row does not
produce a shadow at its stated minute, either the minute is wrong or the model cannot see that
eclipse, and both are reasons not to offer the row.

### src/app/eclipseDays.ts

**Eclipses worth opening. The shadow only draws inside a few hours that happen two or three **

Eclipses worth opening. The shadow only draws inside a few hours that happen two or three times a year, so
left to chance nobody ever sees one.

Times are the published greatest eclipse, to the minute, in UTC.

A wrong minute fails silently: the day loads, the cursor moves, nothing happens. `eclipseDays.test.ts`
runs every row through the same geometry the globe uses.

### src/app/feed.test.ts

**Feed lifecycle invariants, tested without rendering**

Feed lifecycle invariants, tested without rendering.

A cold load always has a front expanding in the first frame, and that cannot be observed here:
announcements coalesce through requestAnimationFrame, which every headless context suspends. What can be
pinned is the rule the handler applies, which is the part that would silently rot.

### src/app/feed.ts

**The two feeds, the store, and whoever needs to know something changed**

The two feeds, the store, and whoever needs to know something changed.

Deliberately not a React store. The globe needs fifty thousand positions out of these events, and
routing that through React state would re-render a tree once per earthquake. So this owns the data and
announces that it moved; the canvas reads it directly and the interface subscribes for counts.

**The archived span being shown, or null when live**

The archived span being shown, or null when live.

On the snapshot rather than in App state, so nothing can read the store without also being able to see
that it is not live. The one way to ship the bad version of this feature is to let some of the chrome
go on saying live while the globe shows last March.

**True for the first announcement that actually carries events: the daily seed. Not "the fir**

True for the first announcement that actually carries events: the daily seed.

Not "the first announcement". Those also fire on status changes, and a source going live beats its own
first batch, so the very first one is reliably empty. Keyed off that, the seed's 227 events got 227
wavefronts and the entrance replay never started.

**The timestamp from which this page believes it has complete coverage, or null before the s**

The timestamp from which this page believes it has complete coverage, or null before the seed.

Reported by whichever source actually fetched a backlog, never inferred. Reading the earliest arrival
says "still filling" forever, because both sources seed a whole day at once. Inferring it from the
first delivery carrying events claimed a covered day off two stray socket pushes: "0 events, last 24
hours". Only a source that fetched a backlog knows how far back it goes.

**The same fact per agency, because the earliest of the two hides the disagreement**

The same fact per agency, because the earliest of the two hides the disagreement.

`coveredSince` is a min: right for the strip, wrong beside two feeds. EMSC returns its most recent page
whatever window is asked for, so at a month USGS vouches for thirty days and EMSC for eighteen hours.

Null means a source has not reported a backlog. That is not a source that reported a short one.

**Which arrivals deserve a wavefront**

Which arrivals deserve a wavefront.

A rule, not a rendering detail, and the canvas cannot be asked about it: announcements coalesce through
requestAnimationFrame, which a hidden tab suspends, so no test can observe this on a real cold load.

The seed creates 227 quakes at once and none of them just happened. One front, the most recent.

**The most fronts one announcement may fire**

The most fronts one announcement may fire.

Live traffic delivers one or two, so this changes nothing in normal running. It is for the resume case:
a backgrounded tab suspends rAF, so arrivals pile up behind one pending callback and land together.

**Replaces everything with an archived span, and stops listening to the present**

Replaces everything with an archived span, and stops listening to the present.

The sources are stopped rather than filtered: a socket push arriving during an archived day would put a
live event into a set from last month. Coverage is the span asked for, so the strip marks all of it
observed. Announced as a seed, which it is - hundreds of events at once, none of which just happened.

### src/app/felt.test.ts

**A community-determined intensity is a mean of what people ticked on a form, so a tenth of **

A community-determined intensity is a mean of what people ticked on a form, so a tenth of a step
is not a thing it knows. Rounded to the whole step and named, because "3.9" means nothing to a
reader and "light" is exactly what the scale calls it. The words are USGS's, including the two
steps that share one: intensity II and III are both "weak" there.

### src/app/format.ts

**GDACS files every flood as severity 0, so nothing ranks them**

GDACS files every flood as severity 0, so nothing ranks them.

The count is what GDACS currently flags, not a census. Its list is capped at 100 like the others - though
every *current* flood measured through the cap - and it lags: a Nepal flood on 2026-08-27 was in no GDACS
type at all two days later. See `sources/gdacs.ts`.

### src/app/gutenberg.ts

**How many earthquakes there are at each size. Ten times as many, each magnitude down, since**

How many earthquakes there are at each size. Ten times as many, each magnitude down, since 1944.

The bend at the bottom is about us, not the Earth: below some size the network stops hearing everything.

Estimate b by maximum likelihood, never by fitting a line to the plotted points. Least squares on
cumulative counts weights the rare big events like the common small ones and is known to be biased. Draw
that same estimate, so what is plotted and what is quoted cannot disagree.

### src/app/hazards.ts

**The five layers as a list, because a glyph cannot be reached by keyboard**

The five layers as a list, because a glyph cannot be reached by keyboard.

Marks became clickable, which gave them a pointer and nothing else. The earthquakes have had the rail's
list from the start.

Order each layer by what it is about: storms by wind, fires by area, floods and volcanoes by recency. An
alphabetical list of a hundred fires answers nothing.

### src/app/histogram.ts

**The window as 24 bars, so the globe can answer "when" as well as "where"**

The window as 24 bars, so the globe can answer "when" as well as "where".

Twenty-four bars of whatever the window divides into, never twenty-four hours. Fixing a bar at an hour
caps the window: a month of hourly bars is 720 of them in 200 pixels. The count never changes, so the
geometry and the scaling carry over.

**Events inside the span both feeds cover, and how many of them both feeds reported**

Events inside the span both feeds cover, and how many of them both feeds reported.

A bare `both` count invites the window's total as its denominator, and at a month that is wrong by a
factor of fifty-five: corroboration reads as 0.9 percent of a 30-day window and is 49.5 percent inside
the 21 hours EMSC actually reaches.

Null when the two feeds have no overlap, which is a different statement from zero.

### src/app/marks.ts

**Which shapes exist, from what is happening**

Which shapes exist, from what is happening.

The one place that knows both the phenomena and the glyphs, so the scene can take polylines and know
nothing about storms, and `shapes.ts` can draw outlines and know nothing about feeds.

Four outlines, no hue: spiral is storm, triangle volcano, flame fire, wavy lines flood.

**The reporting agency, appended to a label that already has words in it**

The reporting agency, appended to a label that already has words in it.

Earthquakes carried their provenance from the start and the hazards carried none, while GDACS was sending
it on every event. Appended, not given a row: "who says" is a qualifier on a fact, not a fact.

**Anchored, so it holds one size on screen: a symbol rather than a measured extent**

Anchored, so it holds one size on screen: a symbol rather than a measured extent. Four strokes, four
marks, one anchor between them, which is what keeps the ticks pointing at the same spot as the globe turns.

Unlabelled and unpickable on purpose. The key names the city, which is better than a tooltip because it
is on screen without anybody having to find the mark first.

### src/app/nearby.perf.test.ts

**The panel's cost, measured rather than assumed**

The panel's cost, measured rather than assumed. `findNearby` walks the whole buffer, and it was written
up as a known cost on the argument that memoising would freeze the neighbour list - which is the right
trade only if the cost is small, and nobody had checked.

Budgeted as a ratio, for the same reason as the event layer: a millisecond threshold cannot tell a
regression from a busy machine.

**Two budgets, because this is the one ratio here that does not cancel across machines. Meas**

Two budgets, because this is the one ratio here that does not cancel across machines.

15.3 on a dev machine after selecting the top four instead of sorting all of them, down from 33.5,
and 22 is the usual headroom over that. A GitHub runner reads **25.20** on the same code, while every
other gate in the suite passes there with room: sync at 0.08/0.15, 0.97/1.05, 6.19/7, clustering at
5.68/7. So the runner is not simply slow - this one measurement is.

The cause is the shape of the reference. `events.perf.test.ts` says a reference has to be shaped like
the workload or the ratio drifts with cache pressure, and shapes its own to match; this file borrowed
that reference, and `findNearby` walks fifty thousand quakes dereferencing `primary` where the
reference writes one typed array. Memory-bound against compute-bound, so the two degrade at different
rates and the runner's memory subsystem lands somewhere a Mac's does not.

Measured, before settling for a second number: reshaping the reference to walk an object graph tightens
the quiet spread from 10% to 2.6% and cuts worst-case drift under load from +27% to +19%. It is the
better estimator and it was not taken, because it moves the scale and would strand the 33.5 -> 15.3
calibration this comment is built on. Worth doing when there is a CI round-trip to spend on it.

So: the dev budget stays tight enough to catch the regression it exists for - the sort coming back
would read 33.5 here - and CI gets one calibrated to its own hardware, 27% over what it actually
measures. Same `process.env.CI` split, and same reason, as `playwright.config.ts`.

It is no longer on a per-second path: the panel memoises on the feed's revision, so this runs when an
earthquake arrives rather than when the clock ticks. The budget is here so that stays true of the
function itself, since a regression would land straight back on every arrival.

### src/app/nearby.ts

**What else happened around here**

What else happened around here.

A magnitude 3 alone is a magnitude 3; a magnitude 3 with forty neighbours inside a day is an aftershock
sequence, and the app already holds every one of them.

Computed on selection rather than continuously: it is a full pass over the buffer.

**Which way the local seismicity runs, as a bearing in [0, 180), or null when it does not ru**

Which way the local seismicity runs, as a bearing in [0, 180), or null when it does not run.

Earthquakes at a subduction zone lie along the trench, so the long axis of the scatter is the trench and
the useful slice is the one across it. A fixed east-west section is right at Japan and useless along the
Aleutians.

**The long axis of a scatter, from the sums of its second moments**

The long axis of a scatter, from the sums of its second moments. Degrees are scaled by `cos(lat)` on the
way in, so east and north are comparable and the axis is not pulled toward east at high latitude.

A bearing modulo 180, because a line has an orientation and no direction: a trench running north-east
runs south-west just as truly.

**The neighbours immediately either side of the pinned event in time. Nearest-in-time rather**

The neighbours immediately either side of the pinned event in time. Nearest-in-time rather than
nearest-in-space, because a sequence unfolds: "the next one" means the next one to happen.

Ties at the same instant resolve arbitrarily and harmlessly: two events sharing an origin time are two
events, and stepping visits both.

### src/app/notableDays.live.test.ts

**The list's claims, against the catalogue that has to back them. Run it with pnpm test:live**

The list's claims, against the catalogue that has to back them. Run it with `pnpm test:live`.

A curated list is an assertion about somebody else's data, and the failure mode is a label that is quietly
wrong: the right day with the wrong magnitude, or a famous local date that is a different UTC day. Both
look fine in a screenshot.

### src/app/notableDays.ts

**Days worth seeing, because the archive's only way in was a blank date field**

Days worth seeing, because the archive's only way in was a blank date field.

Dates are UTC, which is the trap. Loma Prieta is remembered as 17 October 1989 and struck at 00:04 UTC on
the 18th: ask for the 17th and you get an M6.3 in Papua New Guinea. A famous date is usually the local one.

Every row was fetched before it was written down, and `notableDays.live.test.ts` re-checks the magnitudes.

The oldest two look empty and are not: 1960-05-22 holds the largest earthquake ever recorded and six
events at M2.5+. That is the network of the day. `NOTABLE_NOTE` has to say so.

**Largest first, because the two M9.1s are the reason to open this at all**

Largest first, because the two M9.1s are the reason to open this at all.

A dozen, not seventy. A curated list stops being a way in once it needs its own search, and the test
below holds it under sixteen so growth has to be argued for.

### src/app/omori.ts

**Omori's law, drawn against what happened. Aftershocks slow down as one over elapsed time, **

Omori's law, drawn against what happened. Aftershocks slow down as one over elapsed time, so the running
count is a logarithm: steep, then almost flat. A swarm climbs in a straight line instead.

Draw it as a reference curve, never a fit. Fitting `p` to a dozen aftershocks gives a number made of
noise, and printing it would look like analysis.

Count, not rate. A rate needs bins, and at these numbers the bin width decides the answer.

**The observed counts as a step line. Two points per arrival, across then up, because the co**

The observed counts as a step line. Two points per arrival, across then up, because the count is unchanged
between events: a sloping line would claim arrivals at times nothing happened.

Starts at the origin, so the line begins at the mainshock rather than at the first aftershock.

Here rather than in the component, because the doubling is the part that can be wrong and a component
cannot be asked about it without a DOM.

### src/app/permalink.test.ts

**The cross-section, in the link. The one piece of state somebody makes rather than chooses,**

The cross-section, in the link. The one piece of state somebody makes rather than chooses, and the only one
that carries a view: a section has nowhere to be drawn except the map.

One guard of its own beyond the untrusted-input rules: a line with both ends in the same place finds
nothing and reads as a broken link rather than an edited one.

### src/app/permalink.ts

**"Look at this" as a link**

"Look at this" as a link.

Everything lives in the fragment, so nothing is sent to a server and the deployment stays static.

The chosen event travels as the agency's id, never ours. Our key is an arrival counter, so `q12` is a
different earthquake on every machine: the link would look like it worked and show the wrong thing.

**Longitude back into [-180, 180). The camera's is not**

Longitude back into [-180, 180). The camera's is not.

`lon` keeps counting: cross the date line and it gains a whole turn and never gives it back. Links
were coming out as `at=499.37`.

### src/app/useGlobeResources.ts

Optional plate motion, slab, and star-figure data load when enabled. Loaded arrays remain available
when a layer is disabled. Timezone coordinates load independently. Each request ignores completion
after effect cleanup, and failures leave the optional overlay empty. Rendering and preferences
remain owned by their existing components.

### src/app/useGlobeTour.ts

A started tour captures its stop list so feed arrivals cannot reorder the route mid-flight. The hook
owns its dwell timer and capture-phase cancellation listeners, excluding its own button. Camera
coordinates determine arrival and narration; the spring flight has no fixed arrival duration.
Stopping or unmounting clears the timer and listeners.

### src/app/viewLocation.ts

`replaceState` does not emit a browser navigation event. The shared-view writer publishes its
changes through `replaceViewLocation`; `useViewLocation` subscribes copying controls to that
address as well as browser Back/Forward and fragment edits. A manual-copy field therefore stays
current while the camera moves even when the application clock is unchanged. The module owns
notification and subscription cleanup; permalink parsing remains pure.

### src/app/regions.ts

**Named seismic regions, so the rail has somewhere to fly to**

Named seismic regions, so the rail has somewhere to fly to.

Authored, not derived. Clustering the events would make the names change from load to load, and
"cluster 3" is not a place anyone can decide to look at.

The counts are not authored: they are whatever is held and passing the filter, so a quiet region reads zero.

**Counts per region, largest first, over exactly what is on screen**

Counts per region, largest first, over exactly what is on screen.

One pass over the store rather than one per region: eleven passes at fifty thousand events is
eleven times the work to answer the same question.

### src/app/replay.test.ts

**It played from the oldest event held, which was the same thing as a day while a day was th**

It played from the oldest event held, which was the same thing as a day while a day was the only
window. Measured against the real month feed: 215 events at M5 or above, fired over 2.8 seconds,
is 77 fronts a second where `REPLAY_FRONT_MIN_MAG` was chosen for roughly three and this file calls
six a firework. `MAX_RINGS` is 64, so most of them were dropped unseen.

### src/app/replay.ts

**Plays the last day in when the page opens, so the first thing anybody sees is the globe do**

Plays the last day in when the page opens, so the first thing anybody sees is the globe doing something.

Invents nothing. It only changes when the app draws data it already has.

2.8 seconds, down from seven, because it now shares the opening with the boundary reveal.

**The most history the entrance will play, however much is held**

The most history the entrance will play, however much is held.

Playing from the oldest event held was the same thing as a day while a day was the only window. A month
played in 2.8 seconds fires 215 fronts at 77 a second, and `MAX_RINGS` is 64, so most were dropped unseen.

At a wider window the older events are simply already drawn when it starts, which is true to the claim:
the entrance shows what the globe does, not what it holds.

**Fronts are spawned only above this magnitude during the replay. A day holds several hundre**

Fronts are spawned only above this magnitude during the replay. A day holds several hundred events and a
front for each would be noise.

Raised from 4.5 when the replay went from seven seconds to 2.8: the threshold was chosen for roughly
three fronts a second, and shortening the replay without moving it doubled that. Above 5.0 a day yields
five to eight. A quiet day still gets the single front every cold load fires.

### src/app/roll.ts

**Numbers that roll rather than jump. Only on a discrete change. A rolling readout eases tow**

Numbers that roll rather than jump.

Only on a discrete change. A rolling readout eases toward a target, so pointing it at something already
moving frame by frame - the replay, the cursor - makes it a late copy rather than a smooth one.

What is left to roll is a live arrival, and a window change that snaps 872 to 11,363.

**How fast the gap closes, as the time constant of an exponential approach in milliseconds**

How fast the gap closes, as the time constant of an exponential approach in milliseconds.

Exponential rather than a fixed duration, because the distances differ by four orders of magnitude: a
fixed duration either crawls through an arrival or blurs a window change.

Solved, not chosen. Time to land is `tau * ln(gap / 0.5)`, so the largest change the app makes costs
about ten time constants: 55ms puts that at 547ms and a single arrival at 38ms. 120ms measured 1,194ms.

**A number that eases to its target, or the target itself when it must not**

A number that eases to its target, or the target itself when it must not.

Pass `live: false` whenever something else is driving this value a frame at a time, and it passes straight
through. Easing on top of the cursor or the replay makes the readout a late copy of a number that is
already correct on screen.

Its own frame loop, started on a change and stopped on arrival: nothing animates while nothing is happening.

### src/app/scrub.ts

**The window, as somewhere you can stand rather than only a total**

The window, as somewhere you can stand rather than only a total.

A sequence is a thing that unfolds, and the app held a whole day of it and could only draw the end state.
The entrance replay shows that once, for 2.8 seconds, and then throws the ability away.

So the cursor is the replay made permanent and steerable, reusing the same `revealUntil`. Nothing here
invents an event, reorders one or changes a time.

**Advances a playing cursor, and hands back to live when it catches up. Stopping one pixel s**

Advances a playing cursor, and hands back to live when it catches up. Stopping one pixel short of the
present and calling it the present is how a live app stops being one.

The span is passed in rather than remembered, because `to` is the wall clock and moves underneath this.

**Moves the cursor one bar at a time. Do not snap to a boundary. Bars are anchored to now, s**

Moves the cursor one bar at a time.

A bar, never a fixed span: an hour is a 24th of a day and a 720th of a month, so one press would mean two
things depending on a control elsewhere.

Do not snap to a boundary. Bars are anchored to `now`, so the grid slides between one press and the next.

Anywhere in the last bar hands back to live, not only past `to`. Otherwise three steps back and three
forward park on the `to` of three presses ago, and the app reads as live while saying held.

### src/app/search.test.ts

**Search over the only two things this app can honestly search: the authored regions, and th**

Search over the only two things this app can honestly search: the authored regions, and the place
strings the agencies wrote on the events currently held. There is no gazetteer and there cannot be
one under the key constraint, so the cases that matter most here are the ones about what it cannot
find.

### src/app/search.ts

**Searches two things: the eleven named regions, and the place strings the agencies wrote on**

Searches two things: the eleven named regions, and the place strings the agencies wrote on events we hold.

There is no gazetteer and there cannot be one - every geocoder needs a key. So "Paris" finds nothing,
because nothing has happened there, and the empty state has to say which of the two it means.

Regions rank first. They work at zero count: a quiet Kamchatka is still somewhere to go and look.

### src/app/section.test.ts

**Where the line crosses a plate boundary. The tick turns the section from a shape into an e**

Where the line crosses a plate boundary. The tick turns the section from a shape into an explanation, so a
wrong one is worse than none.

The far side of the planet looks like it needs guarding and does not: the great circle through the two ends
is a whole circle, so boundaries cross it everywhere, and everywhere but the section lands outside nought
to length. Asserted below rather than assumed, since the first version carried a distance guard.

### src/app/section.ts

**A cross-section through the crust, along a line drawn on the map**

A cross-section through the crust, along a line drawn on the map.

Every other view answers "where". Depth is the dimension the data carries and the picture cannot show:
on a globe it is a filled or hollow ring. Drawn against distance, a line across Japan puts the Pacific
plate on screen diving west at forty-five degrees, because the earthquakes are the slab.

This is the one thing the flat map is better at than the globe, which is the argument for the map.

**A section through a point, across the local trend rather than along it**

A section through a point, across the local trend rather than along it.

The orientation is the whole value. Earthquakes at a subduction zone lie along the trench, so slicing
across it puts the slab on screen and slicing along it is a smear.

A null trend falls back to west-to-east: with no long axis every orientation is arbitrary, and that is
the direction a cross-section is read in.

**Always read west to east, and south to north when it is neither. Left to the bearing arith**

Always read west to east, and south to north when it is neither. Left to the bearing arithmetic, a
north-south trench reads top to bottom while an east-west one reads left to right.

The epsilon is doing real work: `sin` of 180 degrees is 1.2e-16, not 0, so a test for a negative east
component never fires on the exactly-north-south case.

**The two edges of the corridor, as lines that can be drawn beside the centre**

The two edges of the corridor, as lines that can be drawn beside the centre.

The panel prints "200 km either side" and the map drew only a centre line, so an event just outside the
corridor looked exactly like one just inside.

A point at cross-track angle t off the great circle is `v cos t + n sin t`, the inverse of the `asin`
below, so the edges are exact on the sphere rather than a screen-space approximation that skews with latitude.

**Where the line crosses a plate boundary, as distances along it. The tick turns the picture**

Where the line crosses a plate boundary, as distances along it. The tick turns the picture into an
explanation: the earthquakes start at the boundary and descend away from it.

Found by sign change in the cross-track offset, not by intersecting two great circles - the offset is
already computed for every event.

The range check keeps the far side of the planet out. A great circle is a whole circle, so boundaries
cross it everywhere, and a crossing off the section falls outside nought to length.

### src/app/sound.ts

**One earthquake, one tone. Not a recording - real ground motion is below hearing, so this i**

One earthquake, one tone. Not a recording - real ground motion is below hearing, so this is a transposition.

Pitch falls as magnitude rises, which is what a real rupture does, and duration grows.

Loudness cannot be honest. M2 to M7.5 is 178 million times the energy, so gain is squashed hard and the
legend has to say so.

### src/app/still.ts

**The view as a PNG, with the moment it is of written on it. Always stamp the moment, and ta**

The view as a PNG, with the moment it is of written on it.

Always stamp the moment, and take it from the cursor rather than the clock. An image of live data outlives
the data, and a still is shared by hand with no cache to blame.

Compose it; never grab the canvas raw. The globe's context has a zero clear alpha, so a bare capture is a
globe on transparency, and the chrome that explains it is DOM sitting over the canvas.

**The evidence line under the title. Every number is already in the snapshot**

The evidence line under the title. Every number is already in the snapshot.

No volcanoes. GDACS flags none of them current, so a count beside "Live" would imply they are erupting.

Fires take a `+` when the feed is capped at 100, because one country can fill it and a flat "100 fires"
would state a floor as a total.

**The moment, as the caption states it**

The moment, as the caption states it.

"Live" only when the cursor is not holding a moment and the app is actually live. Anything else is an
absolute time with its date, because a still is looked at later by definition and "18 minutes ago" ages
into a lie the instant the image is saved.

The archive branch exists because this said "Live" about a day in July. An archived still names the day.

**Cropped to the frame, not letterboxed into it. Never cropped below the shorter side of the**

Cropped to the frame, not letterboxed into it. What is scaled is the whole app canvas, with the globe
in the middle and dark to spare, so fitting it fitted its margins too: the same sphere goes from 46% of
the width to about 85%.

Never cropped below the shorter side of the canvas, because that is the most the globe can span. A
portrait canvas cannot satisfy that at this frame's shape, so it falls back to fitting rather than
cutting the poles off a phone's still.

**The scale travels with the picture, because the picture is the part that leaves. Shared, t**

The scale travels with the picture, because the picture is the part that leaves. Shared, the image was a
field of coloured dots with a caption that counted them and never explained them.

Eight stops rather than a two-colour gradient, because both ramps bend: `thermal` turns through red and
orange and `cividis` through a desaturated middle, so interpolating end to end prints a key that does
not match the marks above it.

### src/app/stored.ts

**Saved preferences, behind one prefix instead of ten string literals. Read falls back to th**

Saved preferences, behind one prefix instead of ten string literals.

The prefix was `firstmotion.`, spelled out at all ten sites, so renaming the app would have reset every
returning viewer's rail width, ramp, projection and announce threshold.

Read falls back to the old prefix once and writes the new one, which migrates a preference the first time
its owner opens the page.

### src/app/superlative.ts

**The window's largest against what its region has managed this century. Only inside a named**

The window's largest against what its region has managed this century.

A magnitude alone has no scale beside it: "M6.1, Japan & Kurils" reads as enormous and is an ordinary week
there. On the rare day the window clears the record, the app has a real superlative.

Say "since at least 2000", because that is where the table starts - Valdivia is not in it.

Only inside a named region. Outside the eleven boxes it is mid-ocean, with no local record to compare to.

**Never cite a record that had not happened yet**

Never cite a record that had not happened yet. The table is a maximum over the whole span and knows
nothing about the day on screen: loading 2001-06-23 read "Largest in Indonesia since 2000: M9.1,
December 2004", offered as context for a day three years before it happened.

Comparing against the whole span is still right whenever the record predates the day: if the maximum
over 2000 to 2025 fell before that day, nothing between 2000 and it was larger either.

### src/app/touch.ts

**A short buzz when a mark is picked. On a phone the fingertip covers the mark, so nothing e**

A short buzz when a mark is picked. On a phone the fingertip covers the mark, so nothing else confirms the
tap landed.

On selection only, never on arrival. Buzzing because an earthquake happened is an alert, and an alert needs
consent; this cannot arrive uninvited, so it needs no toggle.

Feature-detected, not user-agent sniffed. Safari on iOS does not implement `navigator.vibrate`.

Twelve milliseconds. Longer reads as a notification.

### src/app/tour.ts

**Flies the camera round the busiest regions, on request**

Flies the camera round the busiest regions, on request.

The design bans motion that means nothing, and this passes only because it is built to: every stop is a
real place with a real count, the rail names both while the camera is there, and any interaction kills it.
A fixed slideshow of pretty margins would fail.

No authored data. Stops come from `REGIONS` and the order from live counts, so it visits wherever today's
earthquakes are. Under reduced motion `flyTo` is instant, so this becomes a sequence of cuts by itself.

### src/app/useNarrow.ts

**Whether a media query matches, kept current**

Whether a media query matches, kept current.

A hook rather than a `hidden`/`block` pair for anything expensive or long: both halves of a Tailwind pair
are in the document, so a block of prose written that way is in the DOM twice.

**True where the whole interface floats over the canvas rather than taking rows and columns **

True where the whole interface floats over the canvas rather than taking rows and columns from it.

The two folds are opposites about this. The rail is 356px of a 1440px screen and covers the globe, so
folding it is worth offering here and nowhere else - narrower, it is a strip or, on a phone, the page.
The bar is the reverse: floating it is transparent and 46px of the rail's height, and the canvas is the
full 900px either way, so there is nothing to gain. Narrower it is an opaque row taking 68px of a 768px
screen and 80px of a phone, which is worth a fold.

### src/app/versus.ts

**Today's energy against the largest earthquake ever recorded**

Today's energy against the largest earthquake ever recorded.

Nothing new is fetched: Valdivia's magnitude is in `NOTABLE_DAYS` and the window's total is already
accumulated in `histogram.ts`.

One event against a whole window, and the wording has to carry that. It also makes the claim conservative,
since the real 1960 day was larger than its mainshock.

Ratios only. `energyOf` is not joules, so a figure in any unit would invent precision.

### src/app/viewer.ts

**The nearest event to where the reader is, roughly**

The nearest event to where the reader is, roughly.

Nothing is asked and nothing leaves the browser. The only input is the timezone, which any page can read
without a prompt, looked up in a table that ships with the bundle.

Name the city, never the reader. A timezone is a region - `Asia/Shanghai` covers all of China - so "310 km
from you" would be a confident claim about a person built from a reference point.

### src/app/windows.ts

**The windows on offer, in one place because three files decide things from them**

The windows on offer, in one place because three files decide things from them.

They were declared in `Timeline.tsx`, which is where the buttons are, and that left the permalink
decoder with no way to know what a valid window was. It clamped to 24 hours, which was correct when a
day was the only option and silently threw away the 7d and 30d views the moment they shipped: a link
to a month opened on a day and looked like it had worked.

**The offered window nearest a number of hours**

The offered window nearest a number of hours.

Snap, do not clamp. A 100-hour window works arithmetically and no button can show it, so a link carrying
one would leave the group with nothing selected and no way back.

Nearest in log space: 100 hours is 4.2 times a day and 0.6 of a week, and linear distance would call the
day nearer when it is not.

### src/data/baseline.ts

**Whether today is a lot, against five years of days: 1,826 of them, quietest 3, median 18, **

Whether today is a lot, against five years of days: 1,826 of them, quietest 3, median 18, busiest 422.

Compare at magnitude 4.5, never at whatever the filter says. How many small events get detected depends on
how many seismometers are nearby, so a count of everything cannot be compared across years. At 4.5 the
catalogue is complete and a difference between two days is the planet.

The sentence has to state that threshold, because it reports on a population the map may not be drawing.

### src/data/depth.ts

**The depth bands, and how many events are in each**

The depth bands, and how many events are in each.

The constants live here, not in `events.ts`, so the legend can import them without dragging three.js into
the first frame.

The counts exist because the hole in a marker was oversold as tracing a slab: in a typical day 1 event of
79 is below 300km, which is one ring on the whole planet. Over seven days it is 14 of 704. So the legend
prints the counts instead of promising the pattern.

### src/data/filter.test.ts

**This asserted true and was written when the argument was the earliest arrival: nothing hel**

This asserted `true` and was written when the argument was the earliest arrival: nothing
held meant nothing to contradict the window. The argument is now coverage, and no coverage
is the one state where the app is certain it cannot answer, so an empty page reporting a
complete day was the failure mode this whole idea exists to prevent.

### src/data/filter.ts

**The window's honest left edge, as a timestamp**

The window's honest left edge, as a timestamp. With no backend a requested window can reach back further
than anything the app holds, so this returns the later of the two and the rail prints whichever it is.

`coveredSince` is coverage, not arrival. As the earliest arrival still held it was true when the seed
fetched an hour and became a permanent lie when it started fetching a day: every event in a full buffer
arrives at page open, so the rail said "still filling" forever.

### src/data/fixtures.ts

**A deterministic pretend planet, for the questions recorded responses cannot answer: what t**

A deterministic pretend planet, for the questions recorded responses cannot answer: what the store does over
four simulated hours, what happens when two agencies report the same rupture with the disagreement real
feeds show, and what happens at capacity.

Seeded, so a failure reproduces exactly rather than turning up once a week in CI.

### src/data/reconcile.test.ts

**The one decision this whole app is about: whether two agencies are describing one earthqua**

The one decision this whole app is about: whether two agencies are describing one earthquake.

It had no direct test - only the store's behaviour around it - which for the project's central claim
is the wrong place to find out it changed.

### src/data/reconcile.ts

**Deciding whether two agencies are talking about the same earthquake**

Deciding whether two agencies are talking about the same earthquake.

Most events above about magnitude 4.5 arrive twice: different identifiers, origin times a few seconds
apart, epicentres tens of kilometres apart, magnitudes on different scales. Counting them separately
inflates every number on the rail and draws two markers on one rupture.

The honest version of association uses travel-time residuals against station data we do not have. What is
available is time, position and size, so the rule is a window on each.

**Both windows are measured, not guessed. Over 24 hours of real M2.5+ activity, 50 of 53 USG**

Both windows are measured, not guessed. Over 24 hours of real M2.5+ activity, 50 of 53 USGS events had an
EMSC counterpart:

             median      p95      max
  origin time   0.1s     3.0s    16.7s
  epicentre     0.0km   19.6km  135.6km

30s/150km matches the same 50 events as the original 60s/200km guess. 20s/100km would drop a genuine pair.

**The third axis. In time and distance, genuine pairs and aftershocks overlap. Magnitude is **

The third axis. In time and distance, genuine pairs and aftershocks overlap. Magnitude is where they do
not, because two agencies describing one rupture agree about its size:

                           pairs   median   p90    max
  M2.5+, 24 hours            50     0.00    0.20   0.40
  M6+, 120 days              47     0.00    0.00   0.10

The obvious objection - `mb` saturates and `Mww` does not, so a great earthquake would split in two - does
not survive the second sample: at M6 and up both agencies report Mw or Mww.

A partial guard, not a fix. A doublet within one magnitude unit still merges.

**True when two readings plausibly describe one earthquake**

True when two readings plausibly describe one earthquake.

Known false positive, narrowed. A large event's immediate aftershocks fall inside the time and distance
windows; the magnitude window removes the common case. A doublet within one unit still merges, and
separating that needs waveform data no keyless feed carries. The detail panel shows every reading it
merged, so a wrong merge is visible rather than hidden behind one number.

### src/data/store.test.ts

**The failure that only shows up in a demo left running for hours**

The failure that only shows up in a demo left running for hours. Four hours of events are pushed through
a store far too small to hold them, so eviction runs tens of thousands of times, and every internal index
is then checked for growth.

Structural assertions rather than a heap reading: a leak here is "an index kept a key after its quake was
evicted", which is directly observable. The heap check is corroboration, not the gate.

**The warm-up has to fill the ring, or this measures the ring filling rather than the ring h**

The warm-up has to fill the ring, or this measures the ring filling rather than the ring holding.

The old one pushed 450 readings into 2,000 slots, so the 1.41MB it reported was mostly the first fill -
a one-time cost that would have passed a store retaining 325 bytes per ingest. Filled properly, twelve
further hours cost 0.044 to 0.085MB across eight runs.

Absolute, not a ratio, unlike the CPU gate next door: retained bytes do not scale with contention.

Checked by making it fail: one retained three-field object per ingest costs 2.302MB, 4.6x over.

### src/data/store.ts

**Holds the events and lets go of them**

Holds the events and lets go of them.

Evict by arrival order, never by origin time. With no backend the window really does start when the page
loads, which is why the rail says "since 21:40". Arrival order is exactly that window and it is O(1);
origin time would need a heap to describe a window the app does not have.

Delete from every index as carefully as you write to it. A Map that only grows is how a live view leaks,
and nothing on screen changes while it happens.

### src/data/types.ts

**What an earthquake is, once two agencies have both described it**

What an earthquake is, once two agencies have both described it.

They disagree: same rupture, different identifiers, different magnitude scales, epicentres tens of
kilometres apart. Flattening that picks a winner at parse time and throws the disagreement away, and the
disagreement is the most interesting thing on screen.

So a Reading is what one agency said and a Quake is the ground moving. Nothing collapses the two.

**What an agency said before it changed its mind, attached by the store**

What an agency said before it changed its mind, attached by the store.

Early magnitudes are automatic and get reviewed: an initial M6.1 becoming M6.4 is ordinary. Replacing the
reading outright meant the number changed and the marker resized with nothing said.

Three fields rather than a trail. The store is bounded at fifty thousand events, and a busy event updated
all afternoon would grow an unbounded array inside it. The middle of a trail answers nothing anybody asks.

**How many people told the agency they felt it, and how hard. The only human number in this **

How many people told the agency they felt it, and how hard. The only human number in this app.

USGS only, and self-selected: it measures where people live and whether they went online afterwards, so
a magnitude 7 in open ocean gets nothing. EMSC runs its own system and does not put it in this feed.

Absent rather than zero when nobody reported: "nobody felt it" and "the agency has no report" are
different claims, and only the second is true.

**Whether a person has checked this reading yet. revision records that a number already move**

Whether a person has checked this reading yet. `revision` records that a number already moved; this says
one may still move, because nobody has looked at it.

USGS only. EMSC sends `auth` and `source_catalog` and no review state, and inferring one from a catalogue
name would be guessing about provenance. Kept as the agency's own two words rather than a boolean, so a
third value is absent rather than silently folded into one of these.

**The strongest shaking the agency's model thinks happened anywhere, on the same scale as fe**

The strongest shaking the agency's model thinks happened anywhere, on the same scale as `felt`.

`felt.intensity` is what people ticked where they were standing; this is what a model says the worst of
it was, whether or not anybody was there. They routinely disagree, which is why both are shown.

A maximum, and the copy must say so, or it reads as "what it felt like". USGS only, and only on the
events they build a map for - about one in thirteen at M4.5.

**The network that actually computed this solution, when the agency names it**

The network that actually computed this solution, when the agency names it.

Both feeds are aggregators. USGS calls this `net` and sends `hv` for the Hawaiian Volcano Observatory;
EMSC calls it `auth` and sends `BMKG`. Without it, a Hawaiian earthquake is credited to the relay.

Kept as the agency's code. Expanding `hv` needs a table of seismic networks that would go stale, and the
app already prints `mww` verbatim for the same reason.

### src/geo/antipode.ts

**The far side, which a globe can show and a map cannot**

The far side, which a globe can show and a map cannot.

A wavefront on a sphere grows to a great circle a quarter of the world away and then shrinks to a point on
the opposite side. The front 150 degrees out is the same length as the one 30 degrees out - 20,015 km each,
against 40,030 at the widest.

Claims no time. Timing the far side needs a path through the mantle, which `arrival.ts` already refused.
A figure, not an animation: where the front would be at fixed intervals of arc.

### src/geo/boundaryDistance.test.ts

**The bug that made the first measurement of this feature wrong**

The bug that made the first measurement of this feature wrong. Vertices here are 10 degrees apart,
so a point directly on the line midway between two of them is 0 km from the boundary and 556 km
from the nearest vertex. Measuring to vertices reported the within-50km share as 11% where the
truth was 32%.

**119.7 km, not the 111.2 that one degree of latitude would suggest, and the difference is t**

119.7 km, not the 111.2 that one degree of latitude would suggest, and the difference is the point.
A line of constant latitude is not a great circle: the arc joining 5N,0E to 5N,20E bulges north to
5.078N at the halfway meridian, so a point at 4N is 1.078 degrees from the arc rather than one. The
equator in the tests above is exempt only because it happens to be a great circle itself.

### src/geo/boundaryDistance.ts

**How far each earthquake is from the nearest plate boundary. Measured against a real day of**

How far each earthquake is from the nearest plate boundary.

Measured against a real day of USGS M2+: median 93 km, half within 100 km, and that band is 9.4% of the
surface - so the belts concentrate seismicity by about 5.4x. That is a floor, because a dense network
finds M2 events in Oklahoma while nobody is listening mid-Pacific.

Not drawn on the marker. Colour and size are magnitude and the fill is depth, so this is a number in the
panel and a sentence in the rail.

**Great-circle distance to the nearest segment, in km**

Great-circle distance to the nearest segment, in km.

To the segment, never to a vertex. Vertices are 139 km apart, so a point halfway along a straight run of
ridge is 70 km from the nearest one and 0 from the line: measuring to vertices put the within-50km share
at 11% where it is 32%.

To the arc, never to the chord. The chord runs through the inside of the planet, and a 10-degree segment
sags 24 km below the surface at its midpoint.

### src/geo/eclipse.test.ts

**Checked against published eclipse paths, so the tolerance comes from the result rather tha**

Checked against published eclipse paths, so the tolerance comes from the result rather than from hope:

  2024-04-08 total    466 km out, umbra  86 km
  2023-10-14 annular  759 km out, umbra -89 km
  2017-08-21 total   1006 km out, umbra  26 km

Timing is far better than position: the position error is the lunar series' own, near one for one,
because the axis pivots about a sun four hundred times further away.

**A partial has to read as a partial. A model returning only 0 or 1 would pass every other t**

A partial has to read as a partial. A model returning only 0 or 1 would pass every other test here and
still be unable to draw one.

  2025-09-07 total    mag 1.36 -> 1.00
  2021-11-19 partial  mag 0.97 -> 1.00   saturates
  2019-07-16 partial  mag 0.65 -> 0.39
  2023-10-28 partial  mag 0.12 -> 0.00   missed
  2024-09-18 partial  mag 0.09 -> 0.00   missed

Below about 0.15 is beyond it: the moon's position is good to 0.08 globe radii across the axis, which
is 29% of the moon's own radius. `penumbral` still says true.

**The case the browser found and this file missed**

The case the browser found and this file missed. Checking only how near the axis passes to the Earth's
centre cannot tell a solar eclipse from a lunar one, because at full moon the three bodies are almost in
a line as well - just in the other order. The first version reported a total solar eclipse during every
lunar eclipse.

### src/geo/eclipse.ts

**Where the moon's shadow falls on the Earth. Nothing new is measured: the sun's direction a**

Where the moon's shadow falls on the Earth. Nothing new is measured: the sun's direction and the moon's
position are both already on screen, and an eclipse is those two multiplied.

A picture, never a prediction, and the copy must say so. The lunar series is good to about a tenth of a
degree, which at sixty Earth radii of lever arm is 670km on the ground - fine against a penumbra 3,500km
wide, useless for telling anybody when to look up.

The umbra is a difference of two large numbers: the cone narrows by 0.0047 Earth radii per radius and has
to cross sixty of them, so it arrives at nearly nothing or short of the surface. The sign of `umbra`
carries which.

**The moon has to be between the sun and the Earth, and a distance check alone does not say **

The moon has to be between the sun and the Earth, and a distance check alone does not say so.

At full moon the axis still runs near the Earth's centre - same line, other order - so `gap` comes out
tiny and every test below passes. This returned a total eclipse with a black disc 3,500km across at noon.

The unit tests missed it: the false positives only happen within 1.5 degrees of the anti-solar point,
which is exactly when a lunar eclipse is on.

### src/geo/figures.test.ts

**Alnilam, the middle star of the belt, is at 84.05, -1.20**

Alnilam, the middle star of the belt, is at 84.05, -1.20.

This is really a units test. If the source were ever swapped for one quoting right ascension in
hours rather than degrees, every coordinate would still be a finite number inside the bounds above
and every figure would be squashed into a twenty-fourth of the sky. Naming one star that has to be
touched is the cheapest way to catch that.

### src/geo/land.test.ts

**The guard for a bug reported four times and misdiagnosed three**

The guard for a bug reported four times and misdiagnosed three.

A vertex stranded on the straight edge of an unsplit neighbour is lifted onto the sphere while that edge
stays a chord, so the mesh opens a lens and the ocean shows through. Invisible at 1x, four pixels at 2x,
and blamed in turn on the graticule, the plate lines and the night overlay.

Two assertions, because either alone passes while the defect is there.

**The date line, checked in the ring rather than in the picture**

The date line, checked in the ring rather than in the picture.

Three Natural Earth rings hold both +180 and -180. Read literally, Eurasia teleports across the world
halfway round its own coastline, and earcut promises nothing about a polygon that is not simple.

The mesh cannot tell the difference: an ordinary earcut needle over Kazakhstan spans 16 degrees and one
out of the date line spanned 19.

### src/geo/land.ts

**Natural Earth 110m, as a filled land mesh and a coastline stroke**

Natural Earth 110m, as a filled land mesh and a coastline stroke.

Vector rather than a satellite texture: a photographic earth puts green, ochre and white across the
sphere and every one competes with the data ramp. Land is chrome here.

The fill is a flat colour and needs no resolution at all. Only the boundary does, and a boundary is a line.

**Longitudes made continuous around a ring, so a landmass crossing the date line stays one s**

Longitudes made continuous around a ring, so a landmass crossing the date line stays one shape.

Three rings hold both +180 and -180. Read literally, Eurasia teleports across the world and back, which
makes it self-intersecting - and earcut promises nothing about a polygon that is not simple. It emitted
needles a hundred and fifty degrees long across Siberia, too thin for the seam filter to catch.

Recentring is not optional. Unwrapping accumulates from wherever the ring starts, and Eurasia's starts in
the Chukotka tip, which leaves the whole continent a turn west and in the next map copy.

**Whole turns to add so a hole sits in the frame of the outline that contains it**

Whole turns to add so a hole sits in the frame of the outline that contains it.

`unwrap` lands each ring in a frame decided by where that ring starts, so the frames are per ring and
the correction has to be too. Giving every hole the outline's shift launched the Caspian a turn east to
411 degrees, and earcut bridged across the world and swept 69 triangles through everything between.

**Closes a ring that wraps the world instead of closing, by walking it round the pole**

Closes a ring that wraps the world instead of closing, by walking it round the pole.

Antarctica is one west-to-east sweep, not a loop, so its closing edge runs 358 degrees back at latitude
-84.5 and cuts through its own coastline. Fill the ring plus a cap: to the antimeridian, down to the pole,
across.

After `unwrap`, never before. Unwrap reads the cap's 360-degree step as a seam and collapses it.

**Split wide triangles here, before anything subdivides them**

Split wide triangles here, before anything subdivides them.

They used to be dropped, on the reasoning that anything wider than half the world must be crossing the
date line. Eurasia spans 207 degrees by nature and Antarctica 358, so dropping them cut a wedge through
Siberia with no fill and no coastline in it.

Safe only because `reframe` and `closeAtPole` removed both sources of malformed output. Bisect the widest
edge rather than clipping against a meridian: in one continuous frame the midpoint is just the average.

**No edge longer than MAXEDGEDEG, and every split shared by both triangles owning the edge**

No edge longer than `MAX_EDGE_DEG`, and every split shared by both triangles owning the edge.

The adaptive passes above strand a midpoint on the straight edge of an unsplit neighbour. That vertex is
lifted onto the sphere while the edge stays a chord, so the mesh opens a lens and the ocean shows through.
Reported four times, proved by painting the ocean green and watching the scratch turn green with it.

The gap is the sagitta, `R(1 - cos(d/2))`, so it goes as the square: 11.4 degrees is four pixels, four
degrees is 0.49px. Of 956,706 edges only 6,014 were over four.

**Repeat whole triangles across the seam, so the mesh is periodic like the map that draws it**

Repeat whole triangles across the seam, so the mesh is periodic like the map that draws it.

`visibleCopies` assumes copy k covers a period centred on k. True of the ocean shell, false here:
`unwrap` runs Eurasia to 190 degrees, so the land poked into the next copy and that copy's ocean painted
over it. The coastline sits in front and survived, which is why Russia's tip was an outline around nothing.

Whole triangles, never clipped. A triangle cut at the seam can tear; a duplicate cannot.

**Every triangle wound so its face points away from the centre**

Every triangle wound so its face points away from the centre. The fill is drawn with `depthTest: false`
and relies on back-face culling to hide the far hemisphere, and earcut preserves the winding of the ring
it is given - Natural Earth's are not all the same. 1,559 of 303,360 faced inward, which showed as
landmasses from the other side of the planet faintly through the ocean.

### src/geo/moon.test.ts

**Checked against eclipses, which is the only way to test a lunar position without shipping **

Checked against eclipses, which is the only way to test a lunar position without shipping a second
ephemeris to test the first against. An eclipse is a dated published fact about the sun and the moon
being in the same place, or exactly opposite ones, at a stated minute: it tests the position, the frame
and the epoch at once, with `sun.ts` as the independent half.

**Successive new moons, found by minimising the elongation rather than by being told when th**

Successive new moons, found by minimising the elongation rather than by being told when they are.

The mean interval is 29.530588 days and no single one is that: the real spacing swings by a quarter of
a day either side, so a year averaged to 29.42 and the first version failed on a true answer. Five
years converges it.

### src/geo/moon.ts

**Where the moon is, in the same frame as everything else on this globe**

Where the moon is, in the same frame as everything else on this globe.

At its real distance, which is only possible because that distance is small: 60 radii out, a quarter of a
radius across. It comes out half a degree wide and shifts against the stars as the camera moves.

The phase is not computed. Light a sphere from where the sun already points and the crescent falls out,
including which way it faces.

Fourteen terms of longitude and eight of latitude, and a consumer set that count. Seven and four is good
to a tenth of a degree, which was ample until `eclipse.ts` multiplied it by sixty Earth radii of lever arm
and put the 2024 April eclipse over New Mexico instead of Chihuahua.

Still not an ephemeris: UTC stands in for Terrestrial Time, worth another 70km.

### src/geo/planets.test.ts

**Two years of samples against the published extremes, which is where the phase term earns i**

Two years of samples against the published extremes, which is where the phase term earns its place:
without it Venus reached -5.9, brighter than it has ever been.

  Mercury  -2.30 to  5.61   (real -2.5 to 5.7)
  Venus    -4.64 to -3.89   (real -4.9 to -3.8)
  Jupiter  -2.82 to -1.89   (real -2.9 to -1.9)
  Saturn    0.68 to  1.20   (real  0.6 to  1.2)

Mars is left out below: its true floor of -2.9 needs a perihelic opposition, which is not in this window.

### src/geo/planets.ts

**The five planets anybody can see, in the same frame as the stars behind them**

The five planets anybody can see, in the same frame as the stars behind them.

Keplerian elements with linear rates, from the standard approximate table for 1800 to 2050. Good to about
a tenth of a degree, a fraction of a pixel on a dot this size.

Magnitudes need the phase term. Without it Venus reached -5.9 against a real ceiling near -4.9: at
inferior conjunction it is closest and so brightest by distance alone, and in truth it is a thin crescent.
Saturn's rings are not modelled, worth up to half a magnitude.

No Pluto, Uranus or Neptune. Uranus is magnitude 5.7 at best, inside the star table's own limit; a dot
labelled Neptune would be a claim about eyesight.

### src/geo/plateMotion.ts

**How fast the plates move, and which way, at 231 points along their edges. Along a ridge th**

How fast the plates move, and which way, at 231 points along their edges. Along a ridge the arrows run
across it, at a trench they point into it, on a transform they lie along it.

Every velocity is a published measurement. PB2002's step file carries the relative velocity for each of
its 5,819 steps, so `tools/make-plate-motion.mjs` samples and rounds and nothing else.

The velocity is relative - one side against the other, not motion over the mantle - and the legend has to
say so, because an arrow cannot.

The samples are not imported here. This is reached from `app/marks.ts`, which App imports at the top
level, so a static import would put 7.1kB in the eager bundle for a toggle that is off.

### src/geo/plates.test.ts

**The seam audit, matching the one the land mesh already had. The plate lines and the gratic**

The seam audit, matching the one the land mesh already had. The plate lines and the graticule cross the same
antimeridian and had no geometry test between them.

This audit found nothing, and that is the result: 2,479 segments, no step anywhere near the wrap guard, and
the widest longitude gap 18.3 degrees at latitude 85.8, which is 1.34 degrees of arc. The tests below hold
those properties rather than rediscover them.

### src/geo/plates.ts

**The tectonic plate boundaries. The earthquakes were always tracing these and nothing said **

The tectonic plate boundaries. The earthquakes were always tracing these and nothing said so, so the Ring
of Fire read as a coincidence of where dots land.

PB2002, Bird (2003), public domain. Douglas-Peucker at 0.15 degrees, under a pixel at the framing shot,
quantised to two decimals: 6,292 vertices become 1,872 and 221kB becomes 9.4kB gzipped.

**A boundary that leaves at +180 and re-enters at -180 is one line in the source data, and j**

A boundary that leaves at +180 and re-enters at -180 is one line in the source data, and joining
those two points draws a chord straight through the planet.

No step in the committed simplification reaches this - the widest is 18.3 degrees - but the data is
a build artefact that could be re-run coarser. `plates.test.ts` feeds it a crossing directly.

**Reorders segments nearest-first from a set of points, for the entrance reveal**

Reorders segments nearest-first from a set of points, for the entrance reveal.

Growing from the events is the claim the picture makes: the dots are where they are because the line is
there. A fade says nothing and a wipe has a direction that means nothing.

Ordering plus a growing draw range, not a shader: a threshold reveal would need a per-vertex attribute
and a custom material for a line layer that needs neither.

### src/geo/slab.test.ts

**The committed table, checked against the claims the key makes about it**

The committed table, checked against the claims the key makes about it.

This is generated data, so the interesting failure is the file being regenerated against a different query
and the sentence beside it quietly becoming false.

**The claim the layer is built on: below 300km, only a descending plate makes earthquakes**

The claim the layer is built on: below 300km, only a descending plate makes earthquakes. If a
regeneration ever spread these evenly it would mean the depth filter had stopped working, and the
picture would be a dusting over the whole planet rather than a set of arcs.

Tonga-Fiji alone should hold a large share. Measured at 1,048 of 1,583 when generated.

### src/geo/slab.ts

**Where the world's slabs are, from five years of the catalogue**

Where the world's slabs are, from five years of the catalogue.

A real USGS day carries 237 events, 14 between 70 and 300km, and exactly two below 300. A subducted plate
reaches seven hundred kilometres down, and two points do not describe a sheet. This is the sample: 1,583
events at M4.5 and deeper than 300km, 2020 to 2025, with 1,048 in the Tonga-Fiji corner alone.

Geography, not data, and drawn that way: no ramp colour, no magnitude size, the same treatment the plate
boundaries get. The boundaries say where two plates meet; this says where one of them went.

Committed, not fetched. It does not change: 37kB of numbers, 12kB over the wire, its own chunk.

### src/geo/sphere.test.ts

**The graticule, which had no test of any kind**

The graticule, which had no test of any kind.

It is scaffolding rather than data, which is why it went unexamined, and it is also a line layer
crossing the antimeridian and running into both poles: the two places every other geometry in this
project has been wrong at least once. The land mesh was wrong at both. This audit found it correct.

### src/geo/sphere.ts

**Turning degrees into points on a ball**

Turning degrees into points on a ball.

Longitude increases east and the prime meridian faces +Z, so a camera parked on +Z looking at the
origin sees 0 degrees dead centre with east to the right. Everything downstream depends on that
convention, which is why it lives in one place rather than being re-derived per module.

**Great-circle distance in kilometres**

Great-circle distance in kilometres.

Haversine rather than the shorter law-of-cosines form, which loses precision to floating point
at small separations. Small separations are the entire use here: deciding whether two agencies
are describing the same rupture turns on tens of kilometres, and that is exactly where the cheap
formula degrades.

**Meridians and parallels at a fixed interval, as line segment pairs ready for a BufferGeome**

Meridians and parallels at a fixed interval, as line segment pairs ready for a BufferGeometry.

Present enough to give the sphere something to read against while it turns, quiet enough to
vanish once events are on it. Poles are skipped: a parallel at 90 degrees is a point.

### src/geo/stars.test.ts

**The real check, and the only one here that could catch a wrong epoch or a sign slip**

The real check, and the only one here that could catch a wrong epoch or a sign slip. `sun.ts` places
the subsolar point from the equation of time and knows nothing about sidereal time, so its longitude
and this file's GMST must add back up to the sun's right ascension - which at a solstice or an equinox
is a definition rather than a measurement.

### src/geo/stars.ts

**The real sky, turned to the moment on screen. The procedural field this replaces looked co**

The real sky, turned to the moment on screen. The procedural field this replaces looked convincing and
Orion was not there to be found.

`tools/make-stars.mjs` commits the Yale Bright Star Catalogue down to magnitude 6.0, about what an unaided
eye reaches: 5,080 stars, 88kB, 34kB over the wire.

Its own chunk. A plain import puts it in `land`, which is modulepreloaded, taking that from 41kB to 76kB
on the critical path for a background.

**Greenwich mean sidereal time in degrees: how far the sky has turned over the prime meridia**

Greenwich mean sidereal time in degrees: how far the sky has turned over the prime meridian. A star at
right ascension `ra` stands over longitude `ra - gmstDeg(at)`, so one rotation places the whole table.

The linear term is enough: the `T^2` correction reaches 0.000026 degrees by 2026, four orders below this
table's own rounding. UTC stands in for UT1, worth 0.004 degrees.

### src/geo/sun.ts

**Where the sun is overhead, right now**

Where the sun is overhead, right now.

The globe was a navy disc: correct, unlit, and reading as a diagram of Earth rather than as Earth. A
terminator fixes that with a fact rather than with styling.

NOAA's low-precision solar position algorithm, good to about 0.01 degrees over 1950-2050.

**Two things the terminator already knew and nothing read**

Two things the terminator already knew and nothing read. `subsolarPoint` is computed every minute to light
the globe, and it answers "what was it like there, then" for free: an earthquake at three in the morning
is a different event from the same rupture at three in the afternoon.

Solar time rather than clock time, and that is the keyless answer rather than a lazy one. Civil time needs
timezone boundaries; this needs the sun, which is already here.

**Daylight, twilight or dark, on the conventional boundaries**

Daylight, twilight or dark, on the conventional boundaries. Civil twilight is the sun within six degrees
of the horizon, the same figure the night shader spreads its terminator over, so the words and the band
agree by construction.

Derived from elevation, not from the clock: at high latitude three in the morning is broad daylight for
months and a band read off the hour would say the opposite.

### src/geo/waves.ts

**Seismic wave speeds, and the one number that decides how they are played back**

Seismic wave speeds, and the one number that decides how they are played back.

Split out of `globe/rings.ts` because these are facts about rock rather than about rendering, and that
module imports three. Importing them from the ring layer dragged the whole of three.js into the eager
bundle for the sake of two floats.

**Playback multiplier for the wavefronts, printed on screen rather than hidden**

Playback multiplier for the wavefronts, printed on screen rather than hidden.

At true rate a front advances 0.16 pixels per second on a 400px globe, which reads as a still image.

Here rather than beside the ring layer: the legend prints it and has no business importing a renderer.

### src/globe/Globe.tsx

**The canvas, and the smallest possible amount of React around it. three.js owns everything **

The canvas, and the smallest possible amount of React around it. three.js owns everything inside it.

The pinned ring and the hover tooltip are plain DOM written from the frame loop, not state: they move
every frame the camera does, and state would re-render the rail sixty times a second.

**Hands out a function that renders and returns the canvas, for the still**

Hands out a function that renders and returns the canvas, for the still.

The caller receives the canvas directly. Browser compositing clears its drawing
buffer, so rendering and reading must happen synchronously in the same tick.

**Two traps in one line. Use degForPx, not degPerPx  px: the second is the flat map's straig**

Two traps in one line.

Use `degForPx`, not `degPerPx * px`: the second is the flat map's straight line, and this camera is
about two radii out, so the sphere's curve is what decides. It ran 34% long. And ask at `toZoom`,
because distance is inversely proportional to zoom - asked at the start of a 1 to 1.9 flight the
answer is nearly twice too big.

They pull opposite ways, so wrong in both directions nearly cancelled and looked deliberate.

The clamp is a backstop and should not bind. If it ever does it lands the event low, towards the
sheet, which is the safe direction to be wrong in.

**The sky, once its own chunk lands. stars.json is 88kB and arrives a beat after the first f**

The sky, once its own chunk lands. `stars.json` is 88kB and arrives a beat after the first frame.

And it wakes the loop: a table landing after the entrance settles would fill buffers nobody draws,
and the sky would stay black until the reader touched something.

**The corridor first, so the centre line and its caps paint over it. Undashed: two more dash**

The corridor first, so the centre line and its caps paint over it. Undashed: two more dashed
lines would read as three sections rather than one with a width.

`coast`, not `hairline`. The corridor exists to answer "why is that quake not in the plot", and
an edge you have to hunt for cannot answer it.

### src/globe/auroraTexture.ts

**The aurora grid as something a shader can sample**

The aurora grid as something a shader can sample.

RGBA rather than one red channel. `ramp.ts` already proves this path works on this renderer, and a
single-channel texture brings row-alignment rules that are only interesting when they are wrong.

Linear filtering. The model publishes one-degree cells, about seven pixels at the framing shot, and
nearest sampling draws a picture of the grid rather than of the sky.

### src/globe/cluster.ts

**Collapses dense margins into one marker until you zoom in. Measured: on a real seed, 149 o**

Collapses dense margins into one marker until you zoom in. Measured: on a real seed, 149 of 228 events had
a neighbour within 40km, which is why the Ring of Fire renders as overlapping crescents.

Bin on a lon/lat grid, not by distance. A grid is O(n) in one pass and stable frame to frame, where
distance-based clusters shimmer as membership flips - and stability matters more than optimal grouping
when the thing is being watched rather than analysed.

**Grid cell size in degrees, derived from zoom. Markers hold a constant size on screen, so h**

Grid cell size in degrees, derived from zoom. Markers hold a constant size on screen, so how many can sit
side by side depends only on how many degrees a screen-width covers.

Above `CLUSTER_UNTIL` nothing is binned: by then every event has room, and collapsing would hide data.

### src/globe/controls.ts

**Orbiting the globe, hand-written. OrbitControls slides a pan target, and on a sphere there**

Orbiting the globe, hand-written. OrbitControls slides a pan target, and on a sphere there is no
target to slide - only a rotation that puts the same coastline back under the pointer.

The camera is kept in longitude, latitude and zoom, so cursor anchoring is a subtraction.

**Screen position of a geographic point, or null when it is round the back**

Screen position of a geographic point, or null when it is round the back.

`radius` is in globe radii, because markers are drawn at their depth: the hit test, hover ring and
tooltip all have to ask about a point *inside* the planet. A surface-only projection puts the pointer
a long way from a 600km event near the limb.

**Degrees of map covered by one screen pixel. Only meaningful once flat**

Degrees of map covered by one screen pixel. Only meaningful once flat.

`atZoom` asks at a zoom the camera has not reached. Distance is inversely proportional to zoom, so
converting pixels for the end of a 1 to 1.9 flight while still at 1 gives nearly twice too much.

**How far out you may go, which is a different question on each view: a globe can be lost, a**

How far out you may go, which is a different question on each view: a globe can be lost, a plane
cannot, because it tiles. So derive the map's floor - the zoom where the frame is exactly 360 degrees
wide - and take whichever is further out. Interpolate on morph, never switch, or leaving a zoomed-out
map snaps the camera.

**How far around the globe a pixel offset from centre actually is**

How far around the globe a pixel offset from centre actually is.

Two wrong versions look fine in code. Dividing by the on-screen radius treats the sphere as flat, and
`asin(px / R)` treats it as seen from infinity; this camera is 4.5 radii out, and the gap is d/(d-1),
about 29%, which slides the coastline out from under the pointer.

    px = focal * sin(sigma) / (d - cos(sigma))

inverts, with u = px / focal, to

    sigma = asin(u * d / sqrt(1 + u^2)) - atan(u)

**Longitude is squeezed by latitude and the drag has to undo it: a horizontal drag moves the**

Longitude is squeezed by latitude and the drag has to undo it: a horizontal drag moves the grabbed
point along its parallel, which at latitude L is only cos(L) as long as the equator. Without this a
140px drag at 70 degrees left the coastline 69 pixels behind. Floored, or a small drag near the axis
becomes a spin.

### src/globe/events.perf.test.ts

**You cannot gate CI on frame time. A shared runner has no GPU and falls back to software re**

You cannot gate CI on frame time. A shared runner has no GPU and falls back to software rendering, so the
number is noise wearing a unit and any threshold loose enough to pass never fails.

Performance files run first in their own Vitest process, followed by all remaining unit files.
This keeps earlier unit workloads from changing the benchmark process’s JIT and heap state.
The partition runs every default test; performance budgets, workloads and deadlines are unchanged.

The allocation check prepares and warms its store in a fixture, then measures the unchanged steady-state
workload with explicit garbage collection. The default test command runs the heap-enabled suite;
a missing collector fails the memory check. Store traversal follows Map insertion order directly,
which is the same arrival order retained by the eviction ring.

Gate on per-frame CPU work instead - filter predicates, projection maths, buffer writes - which is
deterministic and needs no GPU. GPU frame time is measured by hand and recorded with the machine named.

**Budgets in reference units, not milliseconds**

Budgets in reference units, not milliseconds.

Absolute millisecond budgets failed three times on unchanged code, at 13.96ms against 7.65ms quiet.
Fastest-of-N removes sampling noise and does nothing about sustained load. So the budget is a ratio
against `referenceMs`, measured in the same process moments earlier: both numbers move together when the
machine is busy and the ratio does not. The milliseconds are still printed.

**Calibrated, not guessed. Quiet is 0.07, 0.71 and 4.10 reference units; six saturated cores**

Calibrated, not guessed. Quiet is 0.07, 0.71 and 4.10 reference units; six saturated cores move the ratio
13% where the milliseconds moved 20%. These sit about 45% above quiet.

Not immune: the worst seen was +82% in milliseconds with browsers resident, which is memory pressure.

The same three numbers DESIGN.md section 11 publishes. Keep the two in step.

**The held-hour variant gets its own number**

The held-hour variant gets its own number. It reused `BUDGET_REF[50_000]` while doing strictly more work
than the plain sync, so it had the least headroom of any case here and was the first to cry wolf.

Both moved from 6.0 to 7.0, which is a threshold problem rather than a regression: failures came in at
6.02 and 6.49 with four dev servers resident, and both passed 8 of 8 in isolation. At 7.0 there is 30%
headroom over quiet, which still catches an algorithmic change.

**A fixed workload shaped like the thing being measured: trigonometry into a typed array**

A fixed workload shaped like the thing being measured: trigonometry into a typed array. A pure arithmetic
loop would be CPU-bound where `sync` is partly memory-bound, and the ratio would drift with cache pressure.

Roughly, and not across machines. This writes one typed array; `sync` walks several and a Map. A second
machine read 22.85 on the `findNearby` budget against 15.0 here, on code neither of us had touched. Treat
a failure on a different machine as worth reproducing before it is worth believing.

**Fastest of repeated runs, not the median. As a median, the same 50,000-event sync measured**

Fastest of repeated runs, not the median. As a median, the same 50,000-event sync measured 14.99ms in one
test and 8.89ms in the next test of the same file, for identical work.

For a deterministic CPU-bound operation the fastest run is the honest estimate: every slower sample is the
code plus something else, and every scheduler slice and GC pause can only add.

### src/globe/events.ts

**Depth is drawn as shape: a solid disc near the surface, a ring below 300km**

Depth is drawn as shape: a solid disc near the surface, a ring below 300km.

Hue and radius both mean magnitude already, and a second hue is not allowed, so shape is the only
channel left. Deep events are rare on a single day - about one in eighty - so the legend prints the
counts rather than promising a picture that usually is not there.

**Fifty thousand earthquakes in one draw call**

Fifty thousand earthquakes in one draw call.

`Points` with a custom shader, not instanced quads: a point sprite is already a camera-facing disc,
so instancing would rebuild what the hardware does for free. A filter change rewrites two
Float32Arrays and creates no objects, which is what keeps hour four as cheap as minute one.

**Marker radius in CSS pixels: BASE + SCALE  (magnitude - MAGMIN) ^ EXPONENT**

Marker radius in CSS pixels: `BASE + SCALE * (magnitude - MAG_MIN) ^ EXPONENT`.

The exponent is the whole design. At 1.0 an M7 covers the country it happened in. At 0.5 the entire
scale spanned 4.6px to 8.8px, so the key promised "size shows it too" and the globe showed dots.
0.7 holds the small end still and opens the top to 13.5px.

**How far below the surface an event sits, in globe radii**

How far below the surface an event sits, in globe radii.

Depth arrives twice on purpose. `aDepth` saturates at 300km, which is right for the hole in a marker
and useless as a position, because deep events run to 700. Shared with the hit test for the same
reason as `markerRadiusPx`.

**One answer for every bad depth: draw it shallow**

One answer for every bad depth: draw it shallow.

NaN, a negative, and a decimal point in the wrong place all mean the same thing, and the first
version put two of them 6371km apart. Most catalogued earthquakes really are shallow.

**Markers hold their size on screen as the camera zooms**

Markers hold their size on screen as the camera zooms.

Growing them with the globe would magnify the crowding along with everything else, so zooming into a
dense margin would never separate anything.

**Sunk to the hypocentre, so the scatter resolves into the slab: orbit Chile and the events **

Sunk to the hypocentre, so the scatter resolves into the slab: orbit Chile and the events form a
plane dipping under the arc.

Add the offset AFTER fmProject, never by shrinking position first. On the flat map radius IS the
layer index - fmProject builds z from length(sphere) - 1.0 - so a marker pushed in to 0.89 gets filed
under the map and drawn behind the ocean.

(No backticks anywhere in this file's shaders. One ends the template literal, and the error lands
twenty lines from the comment that caused it.)

**Scales markers to the globe's size on screen, not to the zoom**

Scales markers to the globe's size on screen, not to the zoom.

Constant pixels across viewports is what breaks: at 600px wide the globe is 110px across and an M2
marker was 9 of them, so 775 events buried the coastlines. Changes on resize, never while zooming.

**Writes the visible subset into the buffers. Returns how many are drawn**

Writes the visible subset into the buffers. Returns how many are drawn.

`revealUntil` is the entrance replay, and it is an argument rather than a `Filters` field because
it is not a filter: a filter is a choice worth putting in a permalink, this is staging.

**The slice of time the pointer is holding, as a span rather than a bucket index**

The slice of time the pointer is holding, as a span rather than a bucket index.

A bucket is `windowMs / 24`, so at 30 days it is thirty hours, not one. The strip knows its own
bucket width and converts there; this layer must not guess.

**Not depth-tested, or markers get sliced flat near the limb**

Not depth-tested, or markers get sliced flat near the limb.

A point sprite is a screen-aligned square carrying one depth, its centre's. The sphere behind it
curves away, so pixels a few across sit in front of ocean nearer the camera, fail the test, and
leave a straight edge through the dot. The `vFacing` discard already hides the far side.

**Normal blending, never additive**

Normal blending, never additive.

Twenty events stacked in the Flores Sea summed past the top of the ramp and clipped to white,
which is the chrome colour: the densest data drew itself as interface. No opacity fixes that,
it only moves the density where it breaks. Density is the clustering step's job.

### src/globe/figures.ts

**The constellation lines, over the stars they join. A sky nobody can find anything in is st**

The constellation lines, over the stars they join. A sky nobody can find anything in is still a backdrop.

The one layer here that measures nothing - nobody discovered that seven stars are a plough - which is why
it is a toggle, beside the slab and the plate motions.

Faint. The lines exist to be followed, not looked at.

Placed by the same rule as the stars, from `sky.ts`. A line at a different distance or rotation than the
star it points at is a line pointing at nothing.

**The star colour, at the weight a guide line deserves. Not a colour of its own: these belon**

The star colour, at the weight a guide line deserves. Not a colour of its own: these belong to the stars,
and reading as a different material would make them a third thing on screen.

At 0.2 a 360 by 110 patch of sky brightened by 0.14 of a luminance level, which takes hunting for. A
reader who pressed a button labelled "figures" has asked to see figures.

### src/globe/marks.ts

**Every mark that is not an earthquake, in one layer. It knows nothing about storms or volca**

Every mark that is not an earthquake, in one layer. It knows nothing about storms or volcanoes: it draws
achromatic polylines in lon/lat, above the boundaries and below the markers. `shapes.ts` decides what a
phenomenon looks like, `app/marks.ts` decides which exist.

A glyph holds its size on screen; a track does not. Built in degrees, a flame was five pixels of thin grey
line at the framing zoom. A cyclone track is measured geography and scales with the coastline.
`anchor` is what tells the two apart.

**Above the night, like the earthquakes are. At 3.5 these sat under the coastline and under **

Above the night, like the earthquakes are. At 3.5 these sat under the coastline and under the night
overlay while earthquakes draw at 5, so a storm faded at night and a quake beside it did not.

5.5 puts them with the earthquakes: over the geography, because a mark is data and a coastline is
reference, and over the night, because legibility should not depend on the hour it is there.

**The hover highlight is the glyph's own shape, in ink, over itself. A ring round a spiral a**

The hover highlight is the glyph's own shape, in ink, over itself. A ring round a spiral argued with the
app's own rule that marks are told apart by shape.

Its own buffers, sized for one glyph: a flood is three strokes sharing an id.

### src/globe/moon.ts

**The moon, at its real distance, size and phase**

The moon, at its real distance, size and phase.

Nothing is scaled for effect, so it is small: sixty radii out and a quarter of a radius across is half a
degree, about eleven pixels. The enormous moon of photographs is a long lens.

The phase is not computed. The scene knows where the sun is, and a sphere lit from there gives the
crescent and - the part hand-rolled phase code gets wrong - which way the horns point.

No texture: at eleven pixels a map of the maria contributes nothing.

Transparent, but it writes depth. It draws after the stars to cover them and fades with the morph, which
rules out the opaque pass, and writing depth is what keeps it solid over a star.

**The eclipsed moon, and the one warm hue this app admits on purpose. Not a second exception**

The eclipsed moon, and the one warm hue this app admits on purpose.

Not a second exception to the hue ban - the same one from the far end of the ray. The light reaching a
totally eclipsed moon is sunlight bent through the Earth's atmosphere, which is the sunset ring, which is
the rim.

Dim as well as red, but only to a fifth: a real total lunar eclipse is ten thousand times fainter than a
full moon, and drawing that faithfully is a moon that has simply gone.

**The Earth's shadow, which does not care which way the moon is facing**

The Earth's shadow, which does not care which way the moon is facing. A phase is a lighting term and
an eclipse is not: what has been taken away is the source rather than the angle, so this is mixed
over the result instead of folded into the day term.

No falloff across the face. The real umbra edge crosses a disc eleven pixels wide.

### src/globe/morph.ts

**Globe to map, as one geometry**

Globe to map, as one geometry.

Two scenes cross-faded doubles every buffer and every place a layer can be forgotten, and the switch is a
dissolve, which says nothing. A planet unwrapping says what a projection is.

So there is one set of positions, on the sphere, and the plane is derived from them in the vertex shader.

**How much of a layer's radial lift survives on the flat map**

How much of a layer's radial lift survives on the flat map.

Flattened, a radial lift becomes a shift straight at the camera, and perspective magnifies whatever is
nearer. At 0.032 the coastline drew one percent larger than the fill and crept seven pixels outward at the
edge of the frame at zoom 2 - doubling with zoom, which is the signature of parallax. The markers were
worse at 0.048, while `project` places their hover ring at zero.

So shrink the lift to the least that still orders the layers. 0.0002 between neighbours is a few hundred
depth-buffer steps here, and leaves the worst drift under half a pixel.

**The plane comes from the attribute, never from the position. Never recover longitude with **

The plane comes from the attribute, never from the position.

Never recover longitude with atan2. Densifying emits longitudes past 180 and earcut triangulates
there, so atan2 folds 180.5 to -179.5 and a two-degree triangle spans the world. At a pole longitude
does not exist, atan2(0, 0) is zero, and every meridian gets dragged onto the prime meridian.

(No backticks in here. One of them ends the template literal.)

**Which copies of the map intersect the view, as inclusive integer offsets. Two most of the **

Which copies of the map intersect the view, as inclusive integer offsets. Two most of the time, one when
zoomed in, three when the whole world plus both edges is on screen.

Extracted because it is the part that fails quietly: an off-by-one leaves a strip of void at one edge that
looks like the end of the world rather than a missing draw call.

**Derives aLonLat for a sphere shell from its texture coordinates, not its positions**

Derives `aLonLat` for a sphere shell from its texture coordinates, not its positions.

`atan2` fails the shells twice: the duplicated seam column reports -180 for one copy and +180 for the
other, and the pole rows have no longitude at all. The texture coordinate knows both, and only lines up
with longitude because the shells are built with the seam rotated to the antimeridian.

**The pole fans collapse, so the map gets a straight edge**

The pole fans collapse, so the map gets a straight edge. A fan cannot tile a straight line: flattened,
each apex sits at its own column's longitude and the gap between neighbours is a notch, so ninety-six of
them make a dashed line where the map should simply stop.

Pulling each apex back to the ring below makes those triangles zero-height on the map. The globe is
untouched: this is an attribute the plane reads and the sphere position ignores.

### src/globe/planets.ts

**The planets, drawn as the brightest things in the star field**

The planets, drawn as the brightest things in the star field.

Five points, rebuilt on the clock. That is the whole difference from the star field: the stars are written
once and turned by a uniform, and these move against the sky rather than with it.

Drawn exactly like a star - same colour, ramp and shader - so Venus takes its place at the top of a scale
the sky already sets.

Positions go in already turned. A planet's right ascension is only true for the instant it was computed,
so the sky's rotation would be wrong twice: `uSpin` stays at zero.

### src/globe/ramp.ts

**The only place hue is allowed to exist**

The only place hue is allowed to exist.

The warm ramp and the colourblind ramp between them occupy most of the wheel, so keeping every stop in one
file makes the rule enforceable: if a colour is not here it is chrome, and chrome is achromatic.

Uploaded as a 256-pixel texture. Switching ramps is one uniform swap rather than fifty thousand colour
rewrites, and the shader has no way to express a colour that is not on the ramp.

### src/globe/rings.ts

**The signature: a wavefront leaving the epicentre**

The signature: a wavefront leaving the epicentre.

Two seismic feeds have no origin and destination, so a line drawn between two earthquakes asserts a
relationship that does not exist. A ring asserts something true: this happened here, and the energy has
reached this far.

### src/globe/scale.ts

**A scale bar on the map, and the reason it has to name a latitude**

A scale bar on the map, and the reason it has to name a latitude.

A sphere carries its own size and nobody reads a distance off it. A flat map invites exactly that reading
and gave nothing to read against.

On equirectangular a horizontal bar is only true where it is drawn: meridians are evenly spaced, so the
same pixels cover half the ground at 60 north as at the equator. A bar labelled "500 km" with no latitude
on it is wrong nearly everywhere, by up to a factor of eleven.

A vertical bar would need no caveat, but it is not the bar people look for.

**The lengths a bar is allowed to be. A bar reading "1,483 km" is a measurement and a scale **

The lengths a bar is allowed to be. A bar reading "1,483 km" is a measurement and a scale bar is a ruler:
the reader halves it by eye, so it has to be a number that halves.

The range is wider than this camera needs at either end. The small steps cost nothing and stop a future
zoom ceiling silently bottoming this out.

**Nothing rather than nonsense, when the table cannot reach the view**

Nothing rather than nonsense, when the table cannot reach the view. `> 0` is not the guard it looks
like: `Math.cos` of ninety degrees is 6.1e-17, so a pole-on view passed it and asked for a bar 1.5e14
pixels wide. A bar is never more than about 1.6 times off the target, so eight times off means the view
is outside the table entirely.

### src/globe/scene.ts

**The globe's palette, brightest last: sea, land, graticule, coast, plates**

The globe's palette, brightest last: sea, land, graticule, coast, plates.

Every value stays darker than the dimmest earthquake, or the backdrop competes with the data on it. The
exact steps between them were tuned by eye and are easy to make worse; ARCHITECTURE.md says how.

**Greyer geography, for the colourblind ramp. That ramp is blue, and blue geography behind i**

Greyer geography, for the colourblind ramp. That ramp is blue, and blue geography behind it stops being
a separate thing you can see. Re-pick these by eye; scaling the blue ones down does not work.

`--color-coast` and `--color-plate` in `index.css` hold the same two values, for the cross-section's
swatches. Change one and the swatch describes a line nobody draws.

**Drawn before the land, which is the only way it ends up behind it: the land writes no dept**

Drawn before the land, which is the only way it ends up behind it: the land writes no depth, so
nothing occludes the graticule and it drew a starburst across Siberia.

That is also why it fades by colour rather than alpha - transparent would draw after the land, not
before. `setGeography` keeps the pre-blend in step with the palette.

**On the map, rebuild the direction per fragment. Flattening stretches these triangles, and **

On the map, rebuild the direction per fragment. Flattening stretches these triangles, and an
interpolated normal is only exact at their corners: a crease ran along every shared diagonal.

Mixed, never switched. On the globe the interpolated normal is exact, so a hard swap would jump.

**The moon's shadow, on the few days there is one. uPenumbraAng is zero otherwise, so almost**

The moon's shadow, on the few days there is one. uPenumbraAng is zero otherwise, so almost every
frame pays one compare for it.

The umbra needs its own ramp, not the tail of the penumbra's: they differ forty-fold in radius, and one
smoothstep across that makes totality a smudge. An annular eclipse has no umbra and eclipse.ts sends zero.

Move night and day together. Dimming the day alone leaves a grey shadow, which is not what being inside
one looks like.

**Falls off toward the limb, or the lit side is a flat circle rather than a sphere. Take the**

Falls off toward the limb, or the lit side is a flat circle rather than a sphere.

Take the day wash away rather than adding shadow. The wash is the only thing on the lit side with any
strength: removing it is worth about twenty levels, and painting black over an ocean already at 2,10,18
is worth about three.

No backticks in here. One of them ends the shader.

**The aurora, in the one shader that already knows where night is. No backticks in here - on**

The aurora, in the one shader that already knows where night is.

No backticks in here - one of them ends the shader. The morph module warns about this in as many
words and I walked into it anyway.

Multiplied by the night factor, because an aurora is there in daylight and you cannot see it. Drawing
it anyway would be a claim the data does not make.

The fract wraps longitude: the model counts 0 to 359 east and this carries -180 to 180.

The gain of 3 is measured. An ordinary active evening peaks around 28 of 100, so dividing by the
model's nominal maximum would draw every real night as almost nothing.

**A quarter of a level of noise, because this overlay's alpha changes by less than 1/255 ove**

A quarter of a level of noise, because this overlay's alpha changes by less than 1/255 over tens of
pixels and an 8-bit framebuffer turns that into flat bands across Russia.

Dither, not more geometry: 256 segments changed nothing, because interpolation was never the problem.
It only shows at a 2x pixel ratio, so every screenshot taken at 1x said the fill was fine.

**Deep enough to read as night, shallow enough that the geography survives it. At 0.38 land **

Deep enough to read as night, shallow enough that the geography survives it. At 0.38 land in shadow
against ocean in daylight measured 1.084:1, so the lighting out-contrasted what it was lighting.

Tune this one alone. Raising night and day together renders indistinguishable - every step of night is
paid back by a step of day - and the form comes from the gap between them.

**The instant the sun, sky and moon are aimed at, or null to follow the wall clock**

The instant the sun, sky and moon are aimed at, or null to follow the wall clock.

Null is not the same as passing `Date.now()` every frame: it keeps the once-a-minute throttle. Any
real value is aimed at immediately, because a scrub whose sun lagged the marks it drags would be worse
than no sun at all.

**Nothing under world is culled against its own bounds, because those bounds are the wrong s**

Nothing under `world` is culled against its own bounds, because those bounds are the wrong shape.

Every layer is projected in the vertex shader, so three.js measures the sphere the geometry was built
as and never the plane it draws. Flat, a layer occupies x from -2 to 2 while its bounding sphere still
says radius 1.3 at the origin, so an offset copy is thrown away while its triangles are on screen.

The symptom was the east half of a phone going void with its earthquakes still floating in it, because
`events` and `rings` already set this flag.

One traverse over the finished graph, so the reason is written once. A layer added below needs the same.

**What is under the pointer, answered geographically first and in pixels second**

What is under the pointer, answered geographically first and in pixels second.

Projecting every drawn event is a matrix multiply per event per pointer move, and it needs the layer
to keep a list of what it drew, which measured 40% of the fifty-thousand-event budget. A longitude
and latitude makes the first pass a great-circle distance with no projection at all; only a handful
of candidates are projected to settle it, because near the limb angles and pixels disagree.

**Which moment the sky is of**

Which moment the sky is of.

The scene aimed everything from `Date.now()`, so an archived day was drawn under tonight's terminator,
sky and moon phase. One rule decides the instant: the held cursor if there is one, otherwise `clockAt`.

**The fill is culled on the globe and not on the map**

The fill is culled on the globe and not on the map.

Culling is what hides the far hemisphere, since the fill does not depth test. A flat map has no far
hemisphere, so there it only throws away triangles the winding pass got wrong - a family of them
across Asia, leaving a hairline of ocean from the Caspian to Sakhalin.

Deciding the winding in lon/lat instead measured worse: 301 gaps against 126.

Switched late, at 0.9, so it cannot flash: by then there is no far side left to see through.

**The map repeats by drawing the world again beside itself. Only the copies that intersect t**

The map repeats by drawing the world again beside itself. Wrapping each vertex to the nearest copy
in the shader is cheaper and tears, because the three corners of one triangle can land on different
copies. A whole extra pass cannot tear.

Only the copies that intersect the view are drawn: two most of the time, one zoomed in.

### src/globe/shapes.ts

**The glyphs, as polylines in lon/lat. Light gets colour and marks get shapes, so everything**

The glyphs, as polylines in lon/lat. Light gets colour and marks get shapes, so everything that is not an
earthquake is told apart by outline.

Degrees, not pixels: these are things on the ground, and a cyclone really is about six degrees across.

Stretch longitude by `1/cos(lat)` in all of them or a shape stops being that shape away from the equator.
Clamp near the poles, where the factor runs away.

**Where the reader is: four ticks around a gap, pointing in**

Where the reader is: four ticks around a gap, pointing in.

Ticks because this app's corners are ticks or nothing, and no picture of a person would be anything but a
pin from another app or a joke.

The gap is the point. A cross covers the ground it is identifying, and this mark exists to say "that spot".

### src/globe/sink.test.ts

**aDepth was deleted and vDepth is now computed from aSink in the vertex shader, which halve**

`aDepth` was deleted and `vDepth` is now computed from `aSink` in the vertex shader, which halves the
per-event writes in `sync`. That is only allowed if the two agree, so this pins the algebra.

It cannot see the shader. A change to the constants moves both together; a change to the expression in
`events.ts` would not fail here, and the screenshot check covers that half.

**A finite depth below the planet's own radius is not a reading**

A finite depth below the planet's own radius is not a reading. `sinkFraction` already called it
shallow and refused to sink the mark, while the old normalisation clamped it to 1 and drew the mark
hollow: the same absurd value read as deep for the hole and shallow for the offset. One source now
gives one answer, and it is the conservative one.

### src/globe/sky.ts

**Far enough that everything real is in front of it, near enough that the camera's far plane**

Far enough that everything real is in front of it, near enough that the camera's far plane never clips.

The moon sets this: at apogee it reaches 64 radii from the origin and up to 68 from the eye, so a star
nearer than that draws in front of it. Sixty did, until there was a moon to be in front of.

The exact value sets no scale a viewer can see, because the sky is placed relative to the eye.

**Placing a direction in the sky: the sidereal turn, then the skybox offset**

Placing a direction in the sky: the sidereal turn, then the skybox offset.

Buffer positions are unit vectors for a catalogue right ascension, so rotating the sky by -GMST about the
pole puts every one over the longitude it is actually above.

Adding `cameraPosition` puts every point a fixed distance from the eye, so orbiting sweeps the sky and
travelling never slides it. Here rather than in the render loop, so neither layer needs a hook in a loop
that is asleep whenever nothing moves.

### src/globe/slab.ts

**The slab, filled once and left alone. Built from a committed table, so no filter applies: **

The slab, filled once and left alone. Built from a committed table, so no filter applies: it is not a
reading anybody made today, it is the shape of a plate.

The positions carry the depth already. `events.ts` sinks its markers in the shader because their depths
change every tick; these never change, so the trigonometry happens once on the CPU.

**The same lift applied to the colourblind palette's own boundary tone**

The same lift applied to the colourblind palette's own boundary tone. This layer is drawn as geography, so
it has to change with the geography: as a constant it left the slab at chroma 77 on a palette whose
geography sits between 12 and 20, the only saturated thing on a screen chosen for people who cannot rely
on hue.

**Lifted back to the surface as the map unwraps, exactly as the markers are**

Lifted back to the surface as the map unwraps, exactly as the markers are.

The offset is added after the projection, never baked into the radius: on the plane radius is the
layer index, so a point already sunk to 0.9 gets filed under the map and drawn behind the ocean.

(No backticks in here. One of them ends the template literal.)

### src/globe/starfield.ts

**The sky, as 5,080 real stars rather than a hash of the view direction. Orion is over the P**

The sky, as 5,080 real stars rather than a hash of the view direction. Orion is over the Pacific in
January and findable, which a generated field can never be.

A skybox without a skybox, and no per-frame work: the vertex shader adds `cameraPosition` to the star's own
direction, so every star sits a fixed distance from the eye and nothing updates as the camera moves.

Depth-tested, deliberately. Three.js draws opaque before transparent, so a transparent layer with the test
off paints over the planet however low its `renderOrder`. The ocean writes depth first and `STAR_DISTANCE`
is far enough out that every star behind the planet fails against it.

Brightness only, no hue. A blue Rigel beside an orange Betelgeuse would be a second thing on screen where
colour meant something, meaning something different.

**Magnitude spent on size and on opacity together, each on its own curve**

Magnitude spent on size and on opacity together, each on its own curve. The flux ratio across this table
is about 1,400 to 1: on opacity alone that leaves Sirius in a black sky, on size alone it is a scatter plot.

Both gammas are below one. The table is bottom-heavy - 4,176 of 5,080 stars fainter than magnitude 4.5 -
so a typical star normalises to about 0.07, and a gamma above one crushes the catalogue onto the minimum:
measured, 16 lit pixels in a patch of sky where the old field had 164. Below one, 0.07 lifts to 0.31.

### src/sources/archive.ts

**A day that has already happened, from both agencies**

A day that has already happened, from both agencies.

ARCHITECTURE.md called this impossible without a backend and was wrong: both agencies expose FDSN event
endpoints taking an arbitrary `starttime` and `endtime`, keylessly, with `access-control-allow-origin: *`.

What the old note was right about is the shape. A slider that quietly makes "this is happening right now"
false is the version worth refusing, so this is a mode: it replaces the live set rather than blending with
it, and every claim of liveness in the chrome stands down while it is on.

Both parsers are the live ones, so there is no second definition of what an earthquake is.

**How many events a day holds, without fetching them. FDSN has a count method beside query t**

How many events a day holds, without fetching them. FDSN has a `count` method beside `query` that answers
`{"count":684}` in forty bytes, so asking about twelve days costs less than one day's events.

Null rather than zero when the request fails: a day with nothing in it and a day nobody could ask about
are the distinction this app keeps everywhere else.

### src/sources/aurora.ts

**The aurora oval, from NOAA's OVATION model**

The aurora oval, from NOAA's OVATION model.

The first layer that is not an earthquake, and chosen first because it is not more dots: it is a field, so
it renders as light on the night side rather than as another marker.

It arrives already explained: the globe computes the subsolar point every minute, and an aurora is visible
exactly where that shading is. Keyless, `access-control-allow-origin: *`.

**The published grid into a raster, or null when the shape is wrong**

The published grid into a raster, or null when the shape is wrong.

Row-major from the south pole, which is what a texture wants and what the feed publishes, so nothing is
transposed. Longitude stays 0-359 east: the shader wraps it with a `fract`, and rebasing here would be a
second place for the seam to be got wrong.

Null, never a partial grid. A half-filled aurora claims the sky is dark where the parser gave up.

### src/sources/contract.ts

**The suite every source must pass, written while there is only one source**

The suite every source must pass, written while there is only one source.

Write it now. A contract written after the second adapter describes the intersection of what they both
already do rather than what a source owes the app; written first, adding EMSC meant running it unchanged.

Nothing below mentions HTTP, JSON, sockets or magnitudes. It asserts four things: what a reading is, that
stopping stops, that a broken transport degrades instead of throwing, and that nothing is announced twice.

**Makes the transport hand over one payload and waits until the source has processed it**

Makes the transport hand over one payload and waits until the source has processed it.

`mode` is passed because a push source must be told not to hand over data when the transport is meant
to be broken. Always dispatching a message fed a healthy payload into a socket just declared dead.

### src/sources/cyclones.ts

**Tropical cyclones, as tracks rather than dots. A storm drawn as a point is a dot that happ**

Tropical cyclones, as tracks rather than dots. A storm drawn as a point is a dot that happens to be a
hurricane; drawn as a track it explains itself, curving poleward as every cyclone does.

Only what is happening now. GDACS lists 99 and flags 3 `iscurrent`; the other 96 are dead storms.

Leave the polygons on the server. Each storm's geometry payload is 370kB, of which 49 features are
wind-radius rings and a forecast cone - rings in lon/lat walk into all four traps the land mesh paid for.
The 17 LineStrings are 28kB and are a polyline, which this codebase already draws correctly.

**Strongest wind over the storm's life, in km/h, or null when not published**

Strongest wind over the storm's life, in km/h, or null when not published.

Their `severity` number, never their `severitytext`. The two disagree systematically: a storm measured
at 259 km/h is labelled "Tropical Storm". The number is unambiguous and carries a unit.

**The track out of a storm's geometry payload, oldest point first**

The track out of a storm's geometry payload, oldest point first.

GDACS publishes seventeen two-point LineStrings in reverse order, each segment's start being the previous
one's end. Stitch by walking the ends, never by trusting the `Class` numbering, which is a name.

Drop a segment spanning more than `WRAP_DEG`: a Pacific storm really does cross the antimeridian, and
joining 179 to -179 draws a line across the whole world.

### src/sources/emsc.live.test.ts

**The second and last test that touches the real internet. Excluded from the default run and**

The second and last test that touches the real internet. Excluded from the default run and CI.

It asserts the socket still accepts an anonymous connection and nothing about what comes down it: waiting
for an event would fail on a quiet planet.

That connection is the whole basis for the push half of the design. If EMSC ever requires a key, the
project needs a Worker to hold it.

**The two facts the coverage claim rests on, argued rather than measured for a long time: a **

The two facts the coverage claim rests on, argued rather than measured for a long time: a short page is a
complete catalogue for the span asked for, and a full one is truncated at its oldest row. Both hold only
while the portal's ceiling sits far above `SEED_LIMIT` and while it truncates from the old end. Neither
is documented, so neither is promised.

**Asking for four times the limit has to return more than the limit. Measured at 14,958 even**

Asking for four times the limit has to return more than the limit. If it ever comes back at or under
`SEED_LIMIT`, ours has stopped being the binding limit and a page under it could be silently truncated.

Measured at 14,958 events over thirty days on 2026-08-19, against a portal ceiling of 20,000.

### src/sources/emsc.test.ts

**The coverage claim, which nothing checked: every test in this file passed onSeeded an empt**

The coverage claim, which nothing checked: every test in this file passed `onSeeded` an empty function, so
the one branch that decides whether the app claims a month or eighteen hours of it had no test at all.

Sound for a measured reason: the portal's own ceiling is 20,000 rows, thirty-three times `SEED_LIMIT`, so
ours is always the binding limit and a short page is a short catalogue.

### src/sources/emsc.ts

**EMSC, the push half of the pair**

EMSC, the push half of the pair.

The seismic portal publishes a public WebSocket standing order - no key, no registration - and WebSocket
is exempt from CORS, so the browser reaches it directly and the deployment stays zero-invocation.

Nothing about the data differs from the polling case. What differs is who decides when.

**The catalogue, fetched once when the socket opens**

The catalogue, fetched once when the socket opens.

A push source has no history, so on a fresh load EMSC contributed nothing and the rail read `EMSC 0`
beside `USGS 227` - which hid the project's headline claim, since corroboration needs both agencies.

FDSN fixes it in one request: 600 events over 24 hours in 327kB, keyless, CORS-open.

**Held at 600 whatever the window, and the coverage report is what makes that honest**

Held at 600 whatever the window, and the coverage report is what makes that honest. A wider window asks
FDSN for a wider `start` but not for more rows, and raising the cap would be guessing at a limit this
endpoint has never stated - where being wrong is a 400 that takes the seed out entirely. `onSeeded`
vouches only as far as its oldest row when a page comes back full.

**The authority that computed it, which EMSC relays rather than produces: BMKG for Indonesia**

The authority that computed it, which EMSC relays rather than produces: `BMKG` for Indonesia,
`AK` for the Alaska Earthquake Center. USGS carries the same fact under `net`.

`source_catalog` is deliberately not read. It is always `EMSC-RTS`, and reading a review state out
of a catalogue name is guessing about provenance.

**How far back this seed actually reaches, which is not always the whole window. The request**

How far back this seed actually reaches, which is not always the whole window. The request is capped
at SEED_LIMIT, so a full page vouches only as far as its oldest event.

A short page vouches for everything it asked for, and that is measured rather than assumed: the
portal's own ceiling is 20,000 rows, so `SEED_LIMIT` is always the binding limit. Checked in
`emsc.live.test.ts`.

### src/sources/floods.ts

**Floods happening now, which for once is a straightforward claim**

Floods happening now, which for once is a straightforward claim.

Nineteen of the hundred are flagged `iscurrent` and all ended within three days; the other eighty-one run
to 359 days old, so drawing all hundred would be mostly a flood archive.

The list is capped at 100 like every GDACS list, and it does bite: it comes back at exactly 100 across 66
countries at no more than three each, while asking for India alone returns 10. What survives the cut is
the part this layer draws - measured across the flood-heaviest countries, India, China, Indonesia, the
Philippines, Nepal, Bangladesh and Pakistan, **zero current floods were missing from the global list**.
So the count on screen is honest without a floor beside it, unlike the wildfires, and that is a
measurement rather than an assumption. Re-measure it before trusting it again.

No severity to read. GDACS writes `severity: 0.0` for every flood in the list.

### src/sources/gdacs.ts

**The parts of GDACS every hazard layer needs, in one place**

The parts of GDACS every hazard layer needs, in one place.

The list caps at 100 and there is no way past it: `limit`, `pagesize`, `count` and `page` are all ignored
and all return exactly 100. Angola alone returns a full hundred wildfires, so the global response is a
truncated slice of thousands.

Volcanoes are 23 and complete. Floods also come back at exactly 100 and are therefore truncated - asking
for India alone returns 10 where the global list carries 3 - but every *current* flood survives the cut,
measured across the seven countries most likely to have one. That is why the flood count needs no floor
beside it on screen and the wildfire count does. `country=` is honoured, so it is how you re-check.

One request per type. `eventlist=EQ;TC;FL;VO;DR;WF` returns 100 total, 69 of them wildfires.

**Which agency reported it: JTWC for a Pacific typhoon, and so on. GDACS carries this on eve**

Which agency reported it: `JTWC` for a Pacific typhoon, and so on. GDACS carries this on every event and
it was being dropped, while earthquakes have carried their provenance from the beginning.

Trimmed and null rather than empty, so a blank never reaches a label as a dangling separator. Left as the
agency's own initials: expanding `JTWC` needs a lookup table of forecast centres that would go stale.

**One fetch, one type, failing to an empty list rather than into the app**

One fetch, one type, failing to an empty list rather than into the app.

`onAnswer` exists because an empty list and a dead feed drew the same globe: with GDACS down, a viewer read
"no storms today" off a page that had never been able to ask.

A callback rather than a returned pair: the data shape is consumed by memos all through the app, and a
status channel has no business changing any of that.

### src/sources/history.live.test.ts

**EONET, for real. Run it deliberately:  pnpm test:live**

EONET, for real. Run it deliberately:  pnpm test:live

The whole feature rests on a claim about somebody else's API: that `start`/`end` are honoured. GDACS looked
like it honoured them and did not, and the difference is invisible from a single query - which is how this
nearly shipped as a layer that draws one storm on a day that had many. So the assertion is comparative.

### src/sources/history.ts

**The four non-earthquake layers, for a day that has already happened**

The four non-earthquake layers, for a day that has already happened.

GDACS cannot do this, measured twice. Its list takes `fromdate`/`todate` and looks like it honours them,
but the filter runs over the current pool: a year-wide query returns the same 15 fires as no filter,
`eventlist=VO` with dates answers `204 No Content`, and the `ARCHIVE` path hands back today's list. What
looks like history is a few long-running events overlapping the date asked for.

NASA EONET v3 is a real archive: `start`/`end` are honoured, a day is 14-24kB, and it is keyless and
CORS-open. v2.1 ignores the range and returns 18.5MB.

The aurora stays withheld and always will: NOAA publishes a forecast for a stamped minute.

**Where it was, from a title written in one of two shapes by two upstreams**

Where it was, from a title written in one of two shapes by two upstreams. IRWIN writes "RANGE Wildfire,
Roosevelt, New Mexico" and the useful part is the last segment; GDACS-sourced rows come through as
"Wildfire in Russian Federation 1028712". Half the rows on a sample day were the second shape, and the
first version returned nothing for all of them.

### src/sources/types.ts

**What a source is, written before there are two of them**

What a source is, written before there are two of them.

A contract written after the second source exists accidentally describes the first one. This interface has
to be satisfiable by a thing that asks every sixty seconds and by a thing that is told.

The two transports differ in exactly one place, and it is not the data: it is who decides when.

### src/sources/usgs.live.test.ts

**The one test that touches the real internet. Excluded from the default run and from CI**

The one test that touches the real internet. Excluded from the default run and from CI.

  pnpm test:live

Live-API tests are flaky by construction: they fail on a train and when an agency is doing maintenance.
Fixtures cover behaviour; this covers whether the feed still exists, answers, and has the shape the parser
expects. It asserts almost nothing about contents - the hourly feed is genuinely sometimes empty.

### src/sources/usgs.ts

**USGS, asked once a minute**

USGS, asked once a minute.

The polling half of the pair. No key, permissive CORS, and it is why DESIGN.md can promise that
the first frame is never empty: this feed answers immediately to anyone who clones the repo.

**The first request asks for a day; every one after asks for an hour. Not the 2.5+ daily fee**

The first request asks for a day; every one after asks for an hour.

Seeding from the last hour was the plan until it was measured: the hourly feed held 8 earthquakes, four of
them above the default floor. The daily feed holds 227 in 163kB.

Polling the day every minute would cost 163kB a minute to re-learn 8 events, so the seed is a one-off.

Not the 2.5+ daily feed: the magnitude floor belongs to the viewer's filter, not to the fetch.

**Which backlog to ask for, given how far back the viewer wants to see. Measured: the day is**

Which backlog to ask for, given how far back the viewer wants to see. Measured: the day is 0.23MB, the
week 1.5MB, the month 7.4MB. The 2.5+ month is 1.5MB for the same span and is rejected for the same
reason the 2.5+ day is - a baked-in floor makes the slider below it say something untrue.

The cost lands on a click rather than on a page load, which is what makes it acceptable.

**What we have already told the store about. Replaced wholesale each poll rather than accumu**

What we have already told the store about. Replaced wholesale each poll rather than accumulated: both
feeds are rolling windows that restate themselves, so keeping every id ever seen grows forever.

It shrinks from 227 to 8 on the first hourly poll after the daily seed, which is harmless both ways:
the hour is a subset of the day, and a day-event that reappears is treated by the store as a revision.

**One poll. The try block contains the transport and nothing else**

One poll. The try block contains the transport and nothing else.

Scheduling inside it meant that when `browserRuntime` turned out to use `window.setTimeout` and threw
under Node, the catch reported a healthy feed as `failing` with an HTTP-shaped reason. A source that
blames the network for its own bugs shows a lie and schedules a retry that will never help.

### src/sources/volcanoes.ts

**Volcanoes with an eruption episode on record, which is not the same as volcanoes erupting **

Volcanoes with an eruption episode on record, which is not the same as volcanoes erupting now.

GDACS lists 23 and flags none `iscurrent`; the newest episode ended nine days ago and the oldest over two
years. There is no keyless feed of currently erupting volcanoes - the Smithsonian's weekly report sends no
CORS header, which would cost a Worker.

So this layer claims no currency and the legend says what it is instead. They earn their place by sitting
on the same boundaries the earthquakes trace, which needs none of them to be erupting.

Alert level exists and is not used: an Orange on an episode that ended two hundred days ago describes a
concern nobody has any more.

### src/sources/wildfires.ts

**Forest fires burning now: live, complete in its dates, incomplete in its count**

Forest fires burning now: live, complete in its dates, incomplete in its count.

Live is not in doubt - all hundred are flagged `iscurrent`, every `todate` is today, and burns run 3 to 15
days with a median of 9. That duration is what this layer brings: an earthquake is an instant and a fire
is a fortnight.

The count is a floor, never a total. The feed stops at 100 and Angola alone can fill it, so the geography
is right and the number of marks in any one country means nothing. The legend has to say so.

Burned area is real, in hectares, and never encoded in the size of the mark: size belongs to the magnitude
ramp, and at true scale the biggest fire on Earth is a fifth of a degree across.

## src/app/ArchiveControls.tsx

Archive entry, calendar, notable days, and eclipse controls share one component. The archive
hook owns loading and date navigation; this component does not fetch independently.

## src/app/useStill.ts

Capture, caption, encoding, and sharing happen in one hook. Copy the WebGL drawing buffer
synchronously, and keep native sharing inside the initiating user gesture.
Native cancellation is silent. A refusal retains the already-rendered file for an explicit download;
failed capture reports a recoverable notice. The download link is attached during activation and its
object URL survives until a later task. Pending completion cannot update an unmounted exporter.

## src/app/panelLift.ts

The phone focus offset uses the canvas and available zone bounds so a selected event
stays above the detail sheet. The geometry moved unchanged from App into this pure
DOM helper while adding analytics, keeping the orchestration budget from growing.
Desktop and missing-layout cases still return zero.
