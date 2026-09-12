# P1 Planar Integrated-medium Restoration Review

## Status

- Phase: `P1`
- State: `accepted; code and delegated visual review complete`
- Reviewer: Architecture Agent
- Open findings: `none blocking; P1-AR-002 accepted foundation limit; P1-AR-001/003 fixed`
- Visual gate: `passed by Architecture under owner delegation`
- Phase plan:
  [P1 phase plan](../plans/2026-09-02-phase-p1-planar-integrated-medium-restoration.md)
- Frozen predecessor checkpoint:
  A17-G=`3cdd2958d1`; resumed `2026-09-11`

## Review boundary

The September 11 implementation assignment additionally covers direct-Z frame
publication, far-cloud visibility, pixel-footprint filtering and Planar
camera/wind reprojection with variance clipping and receiver rejection. Earlier
checks below describe the preceding depth-only candidate until amended evidence
is recorded. No successor phase is activated.

Review the retained Planar atmosphere/aerial/height-fog/cloud final
composition, its existing resource/history lifecycle, one focused actual-GPU
authority and the deterministic Planar direct page. Globe A1–A17 and every
Planar A5+ feature remain frozen.

## Required evidence

- The first failing product value is reproduced on the real compiled Planar
  path before any product correction, or execution demonstrates that the
  current source already satisfies the final-composition contract.
- One focused actual-GPU witness separates baseline, aerial-only, fog-only,
  cloud-only and combined output over identical clear/finite depth inputs.
- Disabled components preserve identity, alpha is unchanged, finite foreground
  geometry is not replaced by cloud, and clear-depth background is not double
  composed.
- Any product correction includes a compiled mutation of the rejected formula,
  coordinate, distance or depth authority.
- Resource/API/upstream/generated/SGP audit reports exact deltas and preserves
  the zero-delta P1 budget unless Architecture explicitly reopens the phase.
- The direct page retains the same deterministic scene and reports one bounded
  fixed observation sequence without inferring visual acceptance.

## Findings

The September 2 candidate was suspended before review and remains historical.
The owner resumes Planar work on September 11 after the accepted A17 checkpoint.

- P1-AR-001 / high / fixed / Execution, confirmed by Architecture: the recovered
  fixture now verifies combined optical ordering against separate passes,
  premultiplied cloud blending, opaque foreground identity and current distance
  encoding. Final compiled fixture passes; evidence below.
- P1-AR-002 / high / accepted foundation limit / Architecture: the current default page
  shows a coarse, strong horizontal cloud deck. Inspect the same camera with
  component isolation and elevated presets to distinguish layer geometry,
  depth/composition errors and cloud-material quality. Numerical composition
  success cannot establish Globe-equivalent cloud quality or owner acceptance.
- P1-AR-003 / high / fixed / Execution, confirmed by Architecture: the native
  small-near/large-far case reconstructs a 200 km forward receiver with
  9.7–10.6 km radial error through the old Planar path. Three narrow Planar
  raw-depth overload corrections pass the actual depth blocks, including the
  producer at half resolution; the old-expression mutation still fails.

## Pre-amendment verification — 2026-09-11

Final commands use `npm run test -- --includeName "..." --failTaskOnError` on
Chrome 152 / Windows with actual WebGL:

- `qualifies the Planar final medium composition on immutable HDR inputs`:
  **1/1 pass**, 3.193 s. Six component combinations over the same immutable
  clear/finite input, explicit blending/order and foreground checks; native
  `LOG_DEPTH` plus `LOG_DEPTH_READ_ONLY`, 0.1 m near / 30 million m far,
  200 km receiver, all three product depth blocks and half-size producer;
  binary16 diagnostic tolerance 260 m, old mutation error greater than 1 km.
- `renders real opaque planar depth through linear and log aerial variants`:
  **1/1 pass**, 3.009 s. Retains native opaque geometry and Perspective /
  Orthographic behavior, atmospheric and fog deltas, correct program selection.
- `executes one lazy cloud MRT and resizes only for quality`:
  **1/1 pass**, 40.984 s. Actual cloud/resolve/aerial execution, finite output,
  history invalidation, quality resize and existing Globe resource regression.
- Changed JS/Spec ESLint passes. Normal test builds regenerate shaders/bundles;
  generated files are excluded from delivery. Public API/build/resource code
  is unchanged; no full controller/type/package/release matrix is justified.
- Changed supported-file formatting, required full AgentDocs markdownlint and
  `git diff --check` pass. Full AgentDocs Prettier retains the same 16 unrelated
  pre-existing failures; every changed record passes.

The first log-depth probe omitted the native `LOG_DEPTH` define; its failure
was fixture setup, corrected before identifying the approximately 10 km error.
An intermediate Planar producer call to the unregistered standalone builtin
name `czm_screenToEyeCoordinates` then failed compilation. Using the registered
`czm_windowToEyeCoordinates` overload with the producer's own viewport pixel
fixes both dependency discovery and sample coordinates. The temporary longer
test poll was removed after diagnosing that compiler error; standard fixture
timeouts remain. No product fallback, retry or waiting frame was introduced.

## Pre-amendment live observation and cost

The local deterministic page reaches ready/HDR with three expected controllers
and zero errors on the corrected build. Baseline/aerial/fog/cloud isolation
separates the gray-green plane and large white/yellow boxes from medium output.
Ground (5 km) and above-cloud (15 km) views show the retained, coarse cloud
material; the 120 km view has no visible cloud because the unchanged Planar
material fades by camera distance between 60 and 100 km. This limit is not a
new depth failure and is not claimed as high-altitude cloud parity.

Eight paired GPU timer queries compare only old/current final aerial
composition at 1433x1150 against identical live cloud/depth inputs in the
15 km view. Median **0.139264 -> 0.113152 ms**; old range 0.137216–4.325376 ms,
current range 0.111616–0.119808 ms. No disjoint or page error. This bounded
observation is not whole-frame FPS or a sustained speedup claim. Temporary
command-instance wrapper, old program reference, color target/FBO, timer
queries and listener are restored/released in finally. No diagnostic state
or resource is added to product code.

## Amended implementation review — 2026-09-11

The authorized assignment is implemented in the private frame/renderer and
four existing environment shaders. Planar height is directly world Z with
zero reference-ground Z. Cloud slabs retain metric heights and a 300 km
in-medium budget after entry; the old camera-distance density fade is removed.
Main-ray density filtering follows projected pixel footprint independently
of ray integration step length. Cloud material assets, density calibration
and sample budgets remain unchanged.

Planar now uses camera/wind reprojection, HDR variance clipping, current
receiver qualification and foreground/history rejection. CPU double-precision
camera subtraction publishes a relative GPU delta. Continuous camera/frustum
motion can reuse history; existing cut/material/projection/time/light reset
criteria apply. Exact-stationary Planar still publishes deterministic spatial
output with fixed cloud time; this is not progressive stationary accumulation.
Absolute weather/noise coordinates are still GPU floats: the camera-history
delta correction is not a claim of arbitrary-coordinate material precision.

Focused final evidence on actual Chrome 152 / Windows:

- `Planar P1`: **2/2 pass** (10.886 s total). A solid controlled cloud remains
  visible from 120 km in Perspective/log and Orthographic views at large XY.
  The compiled resolve distinguishes a one-pixel camera translation from
  same-position history, matches equivalent wind motion, clips HDR outliers,
  rejects changed receiver history and clouds behind a 1 km foreground, and
  removes absent clouds. Transparent identity uses one binary16 ULP tolerance.
- `invalidates cloud history for every warm discontinuity`: **1/1 pass**,
  8.296 s; continuous Planar camera/FOV motion reprojects while material,
  time discontinuities, log-depth mode and lifecycle cuts reset history.
- Private `SceneGISAtmosphereReferenceFrame`: **4/4 pass**; direct Planar Z,
  custom non-geographic extent, both projections, Globe and failure ownership.
- Existing native opaque depth and bounded segment references: **2/2 pass**.
- `reconstructs phased Globe medium clouds across depth and camera transitions`:
  **1/1 pass**, 174.753 s, including the existing negative controls.
- `qualifies the Planar final medium composition on immutable HDR inputs`:
  **1/1 pass**, 5.098 s; the retained precise-depth mutation remains decisive.
- Existing cloud loop/MRT/depth/composition contract: **1/1 pass**.
- `executes one lazy cloud MRT and resizes only for quality`: **1/1 pass**,
  42.070 s; actual programs, resizing, history and resource destruction.

Together these are 13 distinct focused checks; no broad unrelated matrix was
run. Initial probe compilation failures came from slicing the producer inside
a newly introduced preprocessor block. Keeping the cloud-base declaration
before the conditional adjustment restores complete probe prefixes without
changing runtime height semantics. Source assertions now reference native raw
depth; the removed distance-fade assertion is retired. Product rendering and
the repaired probes all compile. No new fallback or settling policy was added.

The refreshed Planar page reports ready/HDR, three controllers and zero errors.
Ground 5 km, above-cloud 15 km and high 120 km presets were inspected; high
clouds now appear and foreground boxes remain opaque. Cloud texture/detail is
still coarse and distant clouds remain visibly blocky. The user's pre-check
camera position/orientation was restored; the Globe tab was untouched.

After the GPU tests finished, eight live timer samples at 1724x1150 in the
15 km medium view measured cloud producer **4.802 ms median** (4.509–5.178 ms)
and full-resolution resolve **5.145 ms median** (0.826–6.593 ms), with no disjoint.
This short post-reload observation includes transition/startup variability;
it is a current absolute cost sample, not paired regression evidence, whole
frame FPS or a sustained performance claim. An earlier observation overlapping
the GPU Specs is excluded from the final cost evidence. Temporary command
instance wrappers and every timer query were restored/deleted.

Changed JS/Specs pass ESLint; changed supported files pass Prettier; full
AgentDocs markdownlint and `git diff --check` pass. Full AgentDocs Prettier
reports the same 16 unrelated pre-existing files. No public API, build entry,
GPU allocation count or shadow switch changed. Baseline-tree audit finds zero
changed upstream-owned files; SGP and generated-file delivery deltas are zero.
The current task performs Architecture code review; no independent review agent
is claimed.

## Scope and remaining gate

P1-AR-001/003 remain fixed. P1-AR-002 remains open for owner judgment of this
basic-medium result, specifically coarse cloud morphology/detail. Surface
cloud shadows, physical surface lighting, rays, HDR bloom/lens and celestial
parity remain successor work. Numeric success does not close visual quality.
Owner feedback on the restored Planar page has been requested. No P1 checkpoint
or successor activation occurs until the phase gate closes. The historical
stash remains intact; no commit or push is performed.

## Delegated final acceptance — 2026-09-11

The owner authorizes agent visual acceptance and continued implementation
without repeated owner gates. Architecture accepts P1's fixed-Z composition,
visibility, foreground and motion behavior from the recorded actual browser
observations and focused regressions. P1-AR-002 is retained as an accepted
foundation limitation; cloud morphology/detail remains in the
[Planar successor roadmap](../plans/2026-08-14-atmosphere-clouds-effects-extension.md#p2--later-planar-advanced-effects-adaptation-deferred).
No known depth, resource or Globe regression blocks closure. The commit
containing this acceptance is P1's independent local checkpoint. No push;
earlier pending-owner statements are historical and superseded.
