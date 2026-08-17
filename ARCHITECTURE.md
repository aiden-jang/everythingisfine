# First Motion: decisions

Written on the day each decision was made, not reconstructed at the end. A reconstructed log reads
as reconstructed: every alternative loses for a clean reason and nothing was ever tried and
abandoned. The entries worth keeping are the ones where a measurement contradicted the reasoning,
and those are the first thing memory smooths away.

Numbers here come from a measurement or a test. Where a number was produced by hand on one machine,
the machine is named.

---

## No Worker script at all

`wrangler.toml` has no `main`. Cloudflare answers asset requests without invoking a Worker, so the
running cost is zero invocations rather than a small number of them.

This only works because nothing needs a proxy, which was verified rather than assumed before the
architecture was committed to. USGS returns `access-control-allow-origin: *`, and the EMSC endpoint
returns `HTTP/1.1 101 Switching Protocols` with WebSocket exempt from CORS by construction. A single
keyed source anywhere in the design would have forced a Worker to hold the secret and taken the zero
with it.

**Rejected:** OpenSky as the push source. It moved to OAuth2 client credentials, and although
registration is free it is still a secret in an env file, which breaks the rule that the repo must
render its first frame for anyone who clones it.

---

## Vector coastlines, not a satellite texture

Natural Earth 110m, 54KB raw and 21KB gzipped, triangulated at load.

The reason is not sharpness, it is the palette. A photographic earth puts green, ochre and white
across the whole sphere, and every one of those competes with the data ramp, so a viewer ends up
reading hue in two languages at once. Land has to be chrome.

Sharpness is the second reason and it is nearly free: the fill is a flat colour, so it needs no
resolution at all. Only the boundary does, and the boundary is a line.

---

## The land fill is depth-ordered, not depth-tested

**This is the entry that cost the most and it started as a wrong guess.**

Triangulation happens in flat degrees, so a triangle spanning a continent's interior chords through
the sphere instead of following it. The first fix was to lift the land shell fractionally proud of
the ocean, sized from the reasoning that two subdivision passes would leave a worst-case edge near
10 degrees, sagging `1 - cos(5deg) = 0.00095` of a radius. The shell was lifted by 0.002.

Measuring said the worst edge was **31.3 degrees, sagging 0.037 radii**: eighteen times the lift.
The ocean had been cutting up through the middle of every large landmass the whole time, at a
contrast low enough that it read as shading rather than as a bug. The guess was wrong because it
assumed something about the triangles earcut emits in a polygon's interior, and earcut makes no such
promise.

A bigger lift is the wrong fix, because a lift large enough to clear the sag floats the land visibly
off the horizon at the limb. Turning the depth test off removes the question entirely: back-facing
land is still discarded, because winding survives the projection, so ordinary front-face culling
hides the far hemisphere exactly as it does for the ocean sphere. The lines cannot do this, since a
line has no facing, so the graticule and coastline keep their depth test.

Subdivision went to three passes for silhouette accuracy rather than for occlusion, and
`maxEdgeDeg` is now a permanent statistic so that a future data or densify change cannot move it
silently.

**Current geometry:** 171,815 vertices, 303,360 triangles, 4,998 coastline segments, max edge 24.4
degrees.

---

## The camera orbits; the globe never moves

The first pass rotated two nested groups and left the camera parked on +Z. It draws an identical
picture and it is the wrong model as soon as anything has to be picked.

Every question this app asks is geographic: what is under the pointer, where is this event, where
should the camera fly, what does a permalink encode. With the geometry pinned to true coordinates
those are all answered in degrees. With the world spinning underneath, every one of them needs
undoing by a rotation first.

---

## Zoom is magnification, not distance

Written first as a multiple of the framing distance, which is the same information and reads
backwards at every use site. The wheel handler duly zoomed out when scrolled up, and the bug was
invisible on the page because `zoom * 1.5` looks exactly like zooming in.

Naming the quantity after what the user perceives rather than after what the camera stores removed
the whole class of mistake. Clamped to 0.75 and 3.

---

## Dragging inverts a perspective projection, not an orthographic one

Three attempts, and both wrong ones looked reasonable in code.

1. **Pixels divided by the globe's on-screen radius.** Treats the sphere as flat. A 140px drag left
   the grabbed coastline **4.5 degrees** behind.
2. **`asin(px / R)`.** Treats it as an orthographic sphere, which is the projection a sphere has only
   when viewed from infinity. This camera sits 4.5 radii away, and the two cases differ by a factor
   of `d/(d-1)`, about 29% here. It made the slip *worse*, at **5.5 degrees**.
3. **The actual inverse.** For a point `sigma` around from the sub-camera point,
   `px = focal * sin(sigma) / (d - cos(sigma))`, which inverts in closed form to
   `sigma = asin(u*d / sqrt(1 + u^2)) - atan(u)` with `u = px / focal`. Exact, not fitted: at the
   limb it returns `acos(1/d)`, precisely how much of a sphere is visible from distance `d`.

Slip after a 140px drag fell to **0.2 pixels at the equator and 0 pixels vertically**.

The lesson worth keeping is that step 2 felt like a fix. It was a more sophisticated wrong model,
and only measuring at a latitude where the answer is analytically known separated it from a right
one.

---

## North stays up, and the grab is not exactly 1:1

The camera turns about the polar axis, so a horizontal drag moves the grabbed point along its
parallel. A parallel at latitude L is only `cos(L)` as long as the equator, so the drag rate is
divided by `cos(lat)`, floored at 0.25 to stop it diverging at the pole.

That correction helps but cannot reach zero, and the residual is not a bug to be fixed later:

| Camera latitude | Slip after a 140px drag |
|---|---|
| 0 | 0.2 px |
| 12 (framing) | 4.4 px |
| 40 | 17.5 px |
| 70 | 53.3 px |

Exact tracking requires rotating about the axis perpendicular to the drag, which rolls the globe so
that north is no longer up. For a map instrument, north-up is worth more than an exact grab, and
every general-purpose globe makes the same trade. The framing shot sits at 12 degrees, and most
seismicity sits between -45 and +60.

---

## Four bundle budgets, not one

three.js is 127KB gzipped and fixed. Against a single combined ceiling a 20KB regression in
application code reads as 10% drift; against the thing that actually changed it is a third of the
budget. Vendors are paid for once; application code and geometry are what move.

| Chunk | Budget | At step 3 |
|---|---|---|
| Application code | 60KB | 4.1KB |
| Coastline geometry | 40KB | 26.5KB |
| three.js | 135KB | 127.7KB |
| React | 50KB | 45.7KB |

React's 45.7KB is the reserve if application code ever needs it: nothing here uses React beyond
components and effects, so `preact/compat` reclaims most of it. That is a reserve, not a plan.

---

## The frame loop runs only while something moves

Ambient rotation is banned, so an idle globe has nothing to redraw. A permanent animation frame loop
would spend every frame of every idle minute drawing an identical picture, and this is a page meant
to be left open for an hour.

A drag, flick, zoom or reset starts the loop; the frame after the motion settles ends it. Verified
by driving the integrator directly: a hardest-possible flick coasts 65.5 degrees, stops after 1.88
seconds, and `step()` then returns false and keeps returning false.

**Momentum is capped at 200 deg/sec.** Uncapped, a hard flick measured 131 degrees of coast, a third
of the planet from one gesture.

**The reset spring is critically damped**, which falls out of DESIGN.md's stiffness 100 against
damping 20. Measured: an arbitrary camera returns to the framing shot in 0.97 seconds with no
overshoot. Overshoot on a reset reads as a bounce, and a bounce says "animation" where this needs to
say "put back".

---

## Open, and honestly so

- **Reduced motion is written but not observed.** The code path skips momentum and snaps the reset,
  but it has not been run under an actual `prefers-reduced-motion: reduce` setting. Playwright can
  emulate it and that belongs in step B rather than being claimed now.
- **GPU frame time has never been measured**, because until step 7 there is nothing on the globe
  whose cost would mean anything.
