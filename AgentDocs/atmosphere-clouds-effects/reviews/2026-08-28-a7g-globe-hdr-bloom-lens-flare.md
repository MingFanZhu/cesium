# A7-G Globe HDR Bloom and Lens Flare Review

## Status

- Phase: `A7-G`
- State: `accepted; closed`
- Reviewer: Architecture Agent
- Open findings: `none; A7-AR-001 through A7-AR-006 closed`
- Owner visual gate: `passed on 2026-08-31`
- Phase plan:
  [A7-G phase plan](../plans/2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md)
- Decision:
  [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)

## Review boundary

Review the Globe-only half-resolution bright threshold/blur, full-resolution
linear-HDR bloom and Sun ghost/halo composite, exact terrain/cloud visibility
gate, public warm controls and deterministic three-FBO lifecycle.

A2-A6 radiometry/history, native postprocess implementation, A8-G qualification
and every Planar behavior are outside this review.

## Findings

### A7-AR-001 — Bloom intermediates retain NEAREST sampling

`createBloomFramebuffer` relies on `FramebufferManager.update`, whose generated
color texture uses `Sampler.NEAREST`. The A7 blur nevertheless uses the
fractional optimized offsets `1.3846153846` and `3.2307692308`, and the
full-resolution composite samples the half-resolution bright field directly.
Those operations require linear filtering to implement the assigned smooth
separable blur and upsample; with NEAREST they collapse to rounded taps and can
publish block-shaped half-resolution transitions. The uniform `4 x 4` GPU
fixture cannot expose that sampling defect.

Execution must give the two half-resolution bloom textures an explicit linear
sampler using the existing renderer sampler authority, without adding a
texture, framebuffer, program or command. Amend the existing A7 fixture with
one nonuniform bright input that distinguishes linear interpolation from a
nearest-sampled mutation. Do not add a standalone test or resolution matrix.

### A7-AR-002 — The composite does not implement the reference ghost/halo mapping

`sceneGISLensSample` samples
`sun + (sun - outputUv) * scale`. For a localized bright source at `sun`, every
scale maps that source back only when `outputUv == sun`; the three terms
therefore remain centered on the Sun instead of producing the fixed mirrored
ghosts along the Sun-to-screen-center axis. The halo likewise multiplies the
blur value at the current output pixel rather than sampling the reference
mirrored/aspect-correct halo source. Its reversed-edge
`smoothstep(0.18, 0.12, ...)` is undefined by the GLSL contract. The current GPU
fixture fills the entire source texture uniformly, so it proves only that the
lens branch adds some energy and cannot distinguish these mappings.

Execution must adapt the fixed `three-geospatial@b012ad06` ghost offsets/colors
and aspect-correct halo sampling/ring mask into the existing composite shader,
while retaining the accepted Sun visibility/depth/final-HDR gate, additive HDR
composition, `1e-5` source amplitude, alpha identity and finite guard. Amend the
same A7 GPU fixture with one localized bright Sun source and assert at least one
spatially separated expected artifact; the finite-depth version must suppress
that artifact. No new pass, target, public control, parameter sweep or visual
proxy framework is authorized.

## Execution evidence — 2026-08-28

- Implemented the Globe-only half-resolution threshold, shared separable blur and
  full-resolution additive HDR composite. The lens branch uses the fixed
  reference ghost/halo amplitude `1e-5` and is gated by projected Sun visibility,
  exact-clear resolved depth and the final-HDR threshold.
- Added warm public controls with defaults `true/true/10/0.05/1`; all setters
  request render without invalidating A6 history. Planar execution remains an
  exact bypass.
- Lazy A7 topology is exactly three programs, four commands and three color-only
  RGBA16F targets. Bytes are
  `8*W*H + 16*ceil(W/2)*ceil(H/2)`; resource/pass/history/upstream/SGP deltas are
  `3 programs / 4 commands / 3 FBOs / 0 history / 0 upstream / 0 SGP`.
- Focused actual-GPU A7 and lifecycle fixtures pass. Final focused controller,
  A1 pipeline, TypeScript, installed-package and changed-scope checks are listed
  in the A7 review. Browser observations used only the three fixed Globe states;
  render errors were zero.

### Exact execution results

- Actual-GPU A7 fixture: `1/1 SUCCESS`; lifecycle/resource fixture: `1/1 SUCCESS`.
- `SceneGIS/Scene/SceneGISEnvironmentEffects`: `77/77 SUCCESS`.
- A1 private pipeline: `7/7 SUCCESS`; `packages/engine npx tsc`: exit `0`.
- Installed-package verification: `26/26` GLSL and generated modules, exit `0`.
- Final fixed browser observations: high Sun `67.484068°` with lens on and off,
  and below-horizon Sun `-20.119677°`; each raw output was finite and storage
  safe, and browser render errors were `0`.

## Architecture review — 2026-08-28

State: `changes requested`.

Architecture independently inspected the controller, lazy resource lifecycle,
three product shaders and the existing A7 GPU fixture. Public warm controls,
Globe-only execution, native-bloom conflict handling, alpha/finite guard,
three-FBO failure-atomic lifecycle and both-off zero-work boundary match
ADR-0049. Two shader-path findings remain open: the half-resolution targets are
sampled with `NEAREST`, and the current Sun-centered lens equations do not
produce the assigned reference ghost/halo topology. The green uniform-texture
fixture does not cover either failure mode.

Execution is assigned only `A7-AR-001` and `A7-AR-002`. A2-A6, controller API
defaults/ranges, resource counts, pass ordering, native conflict policy,
Perspective Sun gate, Test observations, Planar, upstream files and SGP records
remain frozen. Reuse the one existing A7 GPU fixture; the lifecycle fixture
remains unchanged and need not be rerun unless the correction crosses that
boundary. Return an uncommitted/unpushed `review_ready` correction after focused
checks. Owner gate, checkpoint and A8-G remain blocked.

## A7-AR-001/002 execution correction — 2026-08-28

- Both half-resolution framebuffer textures now use the renderer's existing
  linear sampler; the full-resolution target and resource topology are
  unchanged.
- The composite now uses the fixed reference ghost offsets/colors and mirrored
  screen-space sampling, plus the aspect-correct chromatic halo and cubic ring
  mask. Existing Sun/depth/HDR gates, additive `1e-5` amplitude, alpha identity
  and finite guard remain unchanged.
- The amended nonuniform-source GPU fixture passes `1/1`. It distinguishes the
  product linear sampler from a forced `Sampler.NEAREST` mutation, observes the
  expected spatially separated `-1.5` ghost, and proves finite depth suppresses
  that artifact.
- Resource/API/history/upstream/SGP/Planar deltas for the correction are zero.

## A7-AR-003 Test layout correction — 2026-08-28

`#a7gEvidence` is now a fixed right-side overlay with bounded width/height and
scrolling, so revealing the existing JSON no longer creates a third main-grid
row. At the fixed `1600 x 900` viewport, one direct `A7 可见高日` click kept
both `.worlds` and `#globeViewer` at `483.6328125 px` before and after. The
visible evidence overlay reported `position: fixed`, `width: 702.5 px`,
`height: 607.5 px`, `max-height: 585 px` and `overflow: auto`; its left edge was
`885.5078125 px`, so it remained in the right-side world area and did not cover
the Globe viewport. Capture logic, JSON fields, owner parameters and product
code are unchanged.

## Architecture correction re-review — 2026-08-28

State: `approved; owner visual gate pending`.

Architecture independently inspected the corrected allocation, resize,
composite and amended fixture, then reran only the directly relevant actual-GPU
A7 fixture: `1/1 SUCCESS` on Chrome 151.

- `A7-AR-001` is closed. Both half-resolution targets receive the existing
  linear sampler immediately after allocation in initial and candidate-first
  resize paths. The fixture directly checks both filters and rejects a forced
  `Sampler.NEAREST` mutation on nonuniform input.
- `A7-AR-002` is closed. The composite now contains the fixed nine mirrored
  ghost offsets/colors, aspect-correct chromatic halo sampling and cubic ring
  mask. A localized Sun source produces a separated `-1.5` ghost, while finite
  depth suppresses the same artifact.

Additive scene-linear HDR, `1e-5` source amplitude, final-HDR/depth/Sun gate,
input alpha, finite guard, resource budget, A2-A6, Planar, upstream and SGP
boundaries remain unchanged. Repeating lifecycle, controller, package or full
matrices would add no evidence for this correction. A7-G code review passes;
only the project-owner fixed visual gate remains before the phase checkpoint.

### A7-AR-003 — A7 JSON evidence collapses the owner viewport

The project owner could not perform the visual gate because clicking
`A7 可见高日` made the complete JSON evidence occupy the page. Architecture
reproduced the exact page at `1600 x 900`: `#a7gEvidence` is a static child of
the two-row `main` grid and has no A7 overlay style. Removing `hidden` therefore
created a third `355.977 px` row; the evidence `<pre>` measured `330 px` high
and compressed `.worlds`/`#globeViewer` to `127.656 px`. This is a direct Test
layout defect, not an A7 HDR product failure.

Execution must change `Test/高级环境.html` only. Give `#a7gEvidence` a fixed,
bounded, scrollable overlay on the right side so it does not participate in the
main grid and does not cover the Globe owner viewport. Preserve the existing
three buttons, single-capture logic and reported JSON fields. Do not add a
close/retry/warm-up mechanism, alter product code or change owner parameters.

One direct click at the current viewport is sufficient evidence: report the
before/after `.worlds` and Globe viewer height as unchanged and the evidence
panel as fixed and bounded. Run focused Test ESLint/Prettier and `git diff
--check`; no GPU, controller, package or full matrix is authorized.

## Architecture A7-AR-003 re-review — 2026-08-28

State: `closed; owner visual gate reopened`.

Architecture independently inspected the Test-only CSS and repeated one direct
click at `1600 x 900`. Before and after, `.worlds` and `#globeViewer` both
measured `483.6328125 px` high. The visible evidence measured `position: fixed`,
`overflow: auto`, `width: 702.5 px` and remained wholly to the right of the
`798.75 px`-wide Globe viewport. The owner canvas is no longer compressed or
covered.

`A7-AR-003` is closed. Product JS/GLSL/Specs, capture logic, owner parameters,
resource/API/Planar/upstream/SGP boundaries are unchanged. The focused Test
lint/format/diff evidence is sufficient; no product matrix is repeated. With
all A7 findings closed, only the project-owner visual judgment remains before
the checkpoint.

### A7-AR-004 — Single-scale bloom produces a square Sun and undersized lens features

The project-owner visual gate failed on the fixed high-Sun state. The supplied
final-frame image shows an axis-aligned saturated square around the Sun and lens
ghosts whose footprint is too small. This is direct visual authority and blocks
the A7-G checkpoint.

Architecture re-audited the final shader and the fixed MIT reference. The
physical Sun disk remains the accepted angular disk; the defect begins after
thresholding. SceneGIS currently convolves its extreme HDR signal with only one
finite-support horizontal/vertical kernel and then reuses that same narrow
field for both bloom and lens features. The reference instead spreads bloom
over multiple scales and separately pre-blurs the feature source. Collapsing
those scales leaves a saturated rectangular kernel footprint and undersized
ghosts. Changing Sun radiometry, tone mapping or final RGB intensity would only
hide that morphology and is not authorized.

Execution must keep the existing two half-resolution targets, blur program and
horizontal/vertical command objects, but run the fixed normalized blur as a
three-octave progressive chain with direction radii `1`, `2` and `4`. Each
octave is one horizontal plus one vertical execution through the existing
ping-pong targets; the final broad field remains the input for both general
bloom and the accepted mirrored ghost/halo mapping. This makes the active graph
one threshold, six blur executions and one composite while adding no program,
command object, texture, FBO or GPU byte. Public threshold/intensity defaults,
Sun disk/radiometry, additive HDR composition, depth gate, alpha/finite guard,
A2-A6, Planar and SGP boundaries remain frozen.

Amend only the existing A7 GPU fixture with a localized extreme-HDR source and
one deterministic single-octave mutation. Directly prove nonzero smooth support
beyond the old kernel footprint while retaining the existing alpha, finite and
finite-depth suppression assertions. Do not add a standalone test, parameter
sweep, image hash, replay or proxy visual gate. Then perform one direct fixed
high-Sun browser observation; report honestly if the square or undersized
features remain. Run only the focused A7 fixture and changed-scope lint/format/
diff checks unless a concrete failure expands the boundary. Owner gate,
checkpoint and A8-G remain blocked.

## A7-AR-004 execution correction — 2026-08-28

The existing ping-pong blur now executes three fixed progressive octaves with
radii `1`, `2` and `4`; each octave reuses the same horizontal and vertical
command objects once. The active graph is one threshold, six blur executions
and one composite, with no command-object, program, target, byte or API delta.

The amended localized extreme-HDR GPU fixture passes `1/1`. It observes exactly
three horizontal and three vertical executions, keeps the accepted alpha,
finite/storage, linear-sampler and finite-depth lens assertions, and rejects a
single-octave mutation because only the product retains continuous nonzero
support beyond the former footprint. One fixed same-source high-Sun inspection
showed no axis-aligned saturated square and a materially broader diffuse
ghost/halo field; raw output remained finite/storage-safe and browser errors
were zero. Final visual acceptance remains project-owner authority.

## Architecture A7-AR-004 re-review — 2026-08-28

State: `product correction closed; A7-AR-005 Test witness open`.

Architecture inspected the three-octave scheduling and independently reran the
only affected actual-GPU fixture: `1/1 SUCCESS` on Chrome 151. Each octave reads
the completed threshold target, writes the distinct blur target, then reads that
target and writes back to threshold; radii are exactly `1/2/4`. There is no
read/write alias, resource/API/default change or hidden intensity adjustment.
The amended localized source directly rejects the former one-octave schedule
outside its finite support while retaining the accepted alpha, finite/storage,
linear-sampler and depth-occlusion assertions. `A7-AR-004` is closed.

### A7-AR-005 — “Visible high Sun” does not put the Sun in the owner viewport

The product correction is sound, but the fixed Test witness is not. Architecture
loaded a fresh `1600 x 900` page, enabled the controller and clicked
`A7 可见高日` exactly once. The page correctly reported 15°E/45°N,
`2026-06-21T10:30:00Z` and Sun elevation `67.484°`, but the complete
`799 x 483.6328125` Globe viewport contained no Sun, ghost or halo. Source
inspection confirms `showA7Observation` unconditionally applies the ordinary
ground camera (`heading=0`, `pitch=-5°`) and never aligns it to the live Sun.
Consequently the direct browser observation cannot establish either repaired
owner-visible property.

Execution must change `Test/高级环境.html` only. For the existing high-Sun A7
states, keep the same 15°E/45°N ground destination and all owner parameters, but
derive heading/pitch from the live WGS84 local Sun direction and place the Sun at
the camera center before the existing single-frame capture. Reuse the existing
A5 live-Sun ENU method or factor only the minimal shared Test helper; do not
change the product, time, altitude, public values, capture metrics or below-
horizon state. One fresh click must visibly contain the Sun and allow direct
judgment of the soft bloom and larger ghost/halo. No screenshot metric, retry,
warm-up, hash, threshold or additional Spec is authorized. Run focused Test
ESLint/Prettier and `git diff --check` only. Owner gate, checkpoint and A8-G
remain blocked.

## A7-AR-005 execution correction — 2026-08-28

Test now factors the accepted WGS84 ENU live-Sun calculation into one helper.
The existing A5 preset retains the same calculation, while only the two A7
high-Sun states apply it after updating the clock and restoring the unchanged
15°E/45°N, `500 m` ground destination. The below-horizon state is unchanged.

One fresh `1600 x 900` load, enable and `A7 可见高日` click measured Sun
elevation `67.48406845832537°` and visibly centered the Sun in the Globe
viewport. Direct inspection showed a circular Sun core and broad soft halo with
no axis-aligned square or undersized feature footprint. Raw output was finite
and storage-safe; browser errors were zero. Capture fields, overlay, owner
values and product code remain unchanged.

## Architecture A7-AR-005 re-review — 2026-08-28

State: `closed; owner visual gate reopened`.

Architecture inspected the Test-only refactor. The helper is the same accepted
WGS84 ENU live-Sun calculation formerly embedded in the A5 preset; A5 retains
its destination, state and returned alignment. Only the two existing A7
high-Sun states call it at the unchanged 15°E/45°N, `500 m` destination. The
below-horizon path does not call it, and no product/capture/public value changed.

Architecture then used a fresh `1600 x 900` page, enabled once and clicked
`A7 可见高日` once. The `799 x 483.6328125` Globe viewport now contains the
centered Sun. The prior axis-aligned rectangular bloom footprint is absent and
the source is a broad continuous soft field. This closes `A7-AR-005`; the exact
owner-visible flare balance, including whether the broad field and separated
ghost/halo appearance are desirable, remains exclusively the project owner's
manual judgment. No GPU/controller/package matrix is repeated for this Test-
only correction.

## Project-owner A7 visual gate — changes requested — 2026-08-30

The project-owner image accepts that bloom may spread across the terrain while
rejecting the lens halo as too faint. Architecture separates those two facts.
The Sun is visible at the horizon, and bloom is an additive screen-space optical
point-spread function after the depth-resolved scene. Its soft contribution may
therefore cross the terrain silhouette; clipping every blurred destination
pixel by terrain depth would create an artificial hard horizon edge. The
accepted bloom threshold, intensity, blur, depth gate and composite remain
frozen.

### A7-AR-006 — Default lens feature balance is five times below the reference

State: `open; Execution correction assigned`.

The fixed reference applies overall effect intensity `0.005` and ghost/halo
source coefficients `0.001`, giving a feature-to-bloom coefficient ratio of
`0.001`. SceneGIS currently applies `1e-5` at public
`lensFlareIntensity=1.0` against `bloomIntensity=0.05`, a ratio of only
`0.0002`. This exactly explains the project-owner observation without a
parameter sweep. The revised default is `lensFlareIntensity=5.0`, restoring
`5e-5 / 0.05 = 0.001` while retaining the public `[0,64]` range.

Execution must change only the constructor/JSDoc default, existing default
expectations, installed-package expectation and visible Test default/output.
The Test slider range must expose the existing public `[0,64]` contract. Do not
change GLSL, the internal `1e-5` reference coefficient, bloom, physical Sun,
tone mapping, depth behavior, resources, Planar or any A2-A6 path. Amend no new
test: run the existing constructor-contract Spec and installed-package verifier,
then focused lint/format/docs/diff checks. Observe the same fixed owner view once
at the new default; do not sweep intensities or add a visual proxy gate. Owner
re-gate, checkpoint and A8-G remain blocked.

## A7-AR-006 execution correction — 2026-08-30

The constructor and public JSDoc default are now
`lensFlareIntensity=5.0`; the inclusive `[0,64]` setter contract and warm
history-neutral behavior are unchanged. Existing constructor and installed
delivery expectations were updated, and the Test slider now exposes `[0,64]`
with visible default/output `5`.

The existing constructor-contract Spec passes `1/1`, and the installed-package
verifier passes `26/26` GLSL plus `26/26` generated shader modules. One fresh
fixed high-Sun click at default `5.0` showed a materially stronger, broad soft
halo/ghost field relative to Bloom without a rectangular footprint. Raw output
remained finite/storage-safe and browser errors were zero. GLSL, Bloom,
resources, depth and all frozen product boundaries are unchanged.

## Architecture A7-AR-006 re-review — 2026-08-30

State: `closed; owner visual re-gate reopened`.

Architecture inspected every executable occurrence. The constructor and public
JSDoc default are `5.0`; both fresh/default installed-delivery expectations are
`5.0`; explicit set/read `2.0` assertions remain unchanged; and the Test control
is exactly `min=0`, `max=64`, `step=0.1`, `value/output=5`. The composite still
applies the unchanged internal `1e-5` coefficient and unchanged Bloom term. No
GLSL, renderer resource or lifecycle boundary changed.

Architecture independently reran only the existing constructor-contract Spec:
`1/1 SUCCESS` on Chrome 151. Execution's sequential installed-package verifier
passed after its transparently reported concurrent build-directory race; that
first infrastructure failure required no product change. This closes
`A7-AR-006`. Only the project owner's judgment of the same fixed default-5 image
remains before checkpoint; no further calibration or validation is authorized.

## Final disposition — 2026-08-31

The project owner inspected the corrected default-5 A7 image and explicitly
reported `通过`. This accepts the broad screen-space Bloom crossing the terrain
silhouette as the intended optical spread and accepts the stronger separated
lens halo/ghost balance. All Architecture findings are closed, so A7-G is
accepted and closed. The phase-closing local commit containing this record is
the isolated A7-G checkpoint; no push is authorized.
