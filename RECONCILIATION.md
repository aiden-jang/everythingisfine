# Two agencies, one earthquake

*The long-form piece PLAN.md asks for. One hard problem, in depth, rather than a tour.*

---

## The problem arrived by accident

First Motion had a $0 budget, and I read that strictly: no key that costs money, and no key that a
person cloning the repo would have to go and get. The second half is stricter than the budget
requires and it is the half that shaped everything, because a project that cannot render its own
first frame without a signup has no first thirty seconds.

The scope called for two sources, one polling and one push. The obvious pair is earthquakes plus
something in motion: flights, shipping, network traffic. Every one of those wanted a key. OpenSky
had moved to OAuth2 client credentials, and although registration is free it is still a secret in an
env file. AIS providers all want a key outright.

What remained keyless was **USGS**, polled over HTTPS, and the **EMSC seismic portal**, which
publishes a public WebSocket standing order. One polling, one push, both free, both real.

Both earthquakes.

That looked like a downgrade. Two unrelated feeds tell a story neither tells alone; two feeds of the
same phenomenon looked like one feed with extra steps. It turned out to be the most interesting
problem in the project, because **they report the same events and they disagree about them.**

---

## What the disagreement actually looks like

Here is one earthquake, from the fixture committed in this repo, unedited:

| | USGS | EMSC |
|---|---|---|
| identifier | `usd0015edq` | `20260817_0000423` |
| magnitude | 5.8 `mww` | 5.8 `mw` |
| epicentre | 53.024 N, 159.711 E | 52.972 N, 159.666 E |
| origin time | 12:38:03.4 | 12:38:05.0 |
| place | "72 km E of Petropavlovsk-Kamchatsky, Russia" | "OFF EAST COAST OF KAMCHATKA" |

Nothing matches. Not the identifier, not the coordinates, not the timestamp, and not the place
string. They are **6.48km and 1.55 seconds apart**, which is a close agreement by the standards of
the next section and still means no field can be compared directly.

The magnitudes agree here and that agreement is partly luck. `mww` and `mw` are both moment
magnitudes, so these two are nearly the same measurement; across the rest of the feed the scales
include `mb`, `ml`, `md` and a bare `m`, which are not. Two numbers that round to the same value are
not necessarily the same quantity, and readings routinely differ by a couple of tenths. That is why
the scale travels with every reading and appears beside it on screen: a bare `5.8` would be a claim
about agreement that the data does not make.

A naive implementation ingests both, counts two earthquakes, and draws two markers on one rupture.
Every number in the interface is then wrong by however much the feeds overlap.

---

## Deciding that two records are one event

Seismology calls this **association**, and the rigorous version uses travel-time residuals against
station data. That data is not available for free, so what is left is time and position: two
readings describe one rupture if their origin times are close enough and their epicentres are close
enough.

"Close enough" is where I got it wrong first.

I picked 60 seconds and 200 kilometres. Both sounded careful. Agencies solve independently and land
within a few seconds; location solutions differ by tens of kilometres and by more for deep events.
The numbers had reasoning attached, which is not the same as having evidence attached.

So I measured. Twenty-four hours of real M2.5+ activity from both catalogues, matched by brute
force, and then the distribution of the matches:

| | median | p95 | max |
|---|---|---|---|
| origin-time difference | 0.1s | 3.0s | 16.7s |
| epicentre distance | 0.0km | 19.6km | 135.6km |

**50 of 53 USGS events had an EMSC counterpart.** The agencies agree far more closely than my
"careful" numbers assumed: half the matched pairs agree on origin time to a tenth of a second and on
position to the precision they publish.

The generous window bought nothing and cost something real. At 60s/200km, one of those 50 events
already had **two** EMSC candidates to choose between, which is the failure mode the window is
supposed to prevent. Every extra second also widens the exposure to the false positive below.

Tightening to **30s/150km matched exactly the same 50 events** while halving the time window. That
is strictly better: same recall, less risk. Tightening further to 20s/100km would have dropped one
genuine pair, which is where the evidence stops supporting it and I stopped.

The fixture from that run is committed, along with the measured deltas, so a future data refresh
cannot quietly invalidate the thresholds the tests are really about.

---

## The false positive I cannot fix

A large earthquake's immediate aftershocks can fall inside both windows. An aftershock 20 seconds
after the mainshock and 40km away is, by these rules, the same event.

It is not. Separating them needs waveform data, and no keyless feed carries it.

I could narrow the windows until aftershocks fall outside, but the measurement says that costs
genuine matches before it buys much: real pairs reach 16.7 seconds and 135km, which is squarely
inside aftershock territory. There is no threshold that cleanly separates the two using only time
and distance, because the two populations genuinely overlap.

So it is documented rather than hidden, and the interface is built so a wrong merge is *visible*:
the detail panel lists every reading that was folded together, with its agency, its magnitude, its
scale and its own coordinates. If two readings 40km apart are showing under one marker, you can see
that they are, and you can see why the app thought they were one thing.

That is the difference between a limitation and a lie.

---

## Keeping both readings

The obvious data model flattens a merged event: one magnitude, one position, one identifier.

That model cannot exist here, because it forces a winner at parse time and throws away the
disagreement, and **the disagreement is the most interesting thing on the screen.** So a `Reading`
is what one agency said, and a `Quake` is the ground moving, and nothing collapses the two.

The marker has to be drawn from *something*, so one reading is primary. USGS, always: not because it
is more correct, but because a marker that moves depending on which feed happened to arrive first
is worse than one drawn consistently from the global catalogue of record. The choice is stable, it
is stated on screen next to the reading it came from, and a test asserts it is the same whichever
order the two feeds arrive in.

Revisions matter too. Agencies re-solve events and republish them, so a later reading from the same
agency **replaces** its predecessor rather than joining it. Appending instead would grow an
unbounded array inside a bounded store, which is the kind of leak that survives an hour and fails at
four.

---

## Making it fast enough to be boring

Association is a search: for each arriving reading, is there a held event it belongs to? Done
naively that is a comparison against every event in the buffer, fifty thousand of them, on every
arrival.

Two indices make it O(1) in practice.

The first is by `source:id`, which turns a revision into a lookup rather than a search. The second
buckets events by origin time at exactly the association window's width, so candidates for any
reading live in its own bucket and the two either side. Three small sets instead of fifty thousand
comparisons.

The bucket index is also where the interesting bug lives. When an event is evicted from the ring
buffer its key is removed from its bucket, and if the bucket is then empty **the bucket itself must
be deleted**. Leaving an emptied `Set` behind costs nothing visible and accumulates one entry per
minute of wall clock, forever. It is invisible because nothing about the picture changes while it
happens. The four-hour test asserts the bucket count does not grow, which is a far more useful thing
to assert than "memory stayed flat", because it names the actual failure.

---

## The bug that would have looked like success

Permalinks put the pinned event in the URL. The store's key was right there, so the first version
used it.

The key is `q` plus an arrival counter. It is stable for as long as one page is open and completely
meaningless anywhere else, because the twelfth event to arrive on my machine is not the twelfth on
yours. A shared link carrying `q12` restores **a different earthquake**, confidently, with a panel
full of plausible detail.

This is the worst class of bug: it does not throw, it does not look broken, and the only way to
notice is to check that the earthquake you are looking at is the one that was shared.

The fix follows from everything above. An event's portable name is the agency's name for it, so the
fragment carries `usgs:usd0015edq`, and the index that resolves it already existed for revision
handling. A browser test now asserts the link never contains our own key, and that a fresh page
opening it lands on the same earthquake.

A shared event may of course be gone: the buffer holds a rolling day. The rail says so, in words,
rather than opening no panel and looking broken.

---

## What I would tell someone starting this

**The constraint produced the better project.** Two overlapping feeds are harder than two unrelated
ones and they force work that is genuinely worth showing: identity resolution, a reconciliation
policy, an interface that displays disagreement. I would not have chosen this problem. Having a
budget of zero chose it for me.

**Thresholds deserve measurement, not reasoning.** My 60s/200km had a paragraph of justification
behind it and was twice as loose as it needed to be. The paragraph was the problem: it felt like
evidence.

**Decide what a wrong answer looks like before you optimise the right one.** Aftershock merging
cannot be fixed, so the design question became how to make it visible. That reframing produced the
detail panel, which is now the best screen in the app.
