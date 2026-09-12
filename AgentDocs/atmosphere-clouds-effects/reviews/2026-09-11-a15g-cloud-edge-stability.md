# Review: A15-G Cloud Edge Temporal Stability

## Metadata

- Type: `review`; created / updated: `2026-09-11`
- Author: Architecture Agent; implementation/review performed in this task
- Status: `completed; Architecture accepts bounded correction after owner feedback`
- Target: working candidate against A14 `6e488bc50eb95535e39bcd2bb0c59268acbb9f7b`
- Phase: [A15 plan](../plans/2026-09-11-phase-a15g-cloud-edge-stability.md)
- Parent: [extension plan](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Diagnosis: [cloud edge stability](../discussions/2026-09-11-globe-cloud-edge-temporal-stability.md)
- Policy: [ADR-0048 A15 amendment](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md#a15-g-amendment--continuous-medium-cloud-coverage)
- Upstream-owned files changed: none; new / modified SGP: none
- Commit / push: none; A15 remains active pending owner visual acceptance

## Initial reviewed implementation (superseded)

The sole product change is the SceneGIS-owned cloud resolve GLSL. Its existing
qualified 3x3 neighborhood supplies a mean/front anchor when positive tent
samples are transparent. The packed resolved validity describes this current
support, allowing both cloud reprojection/advection and aerial composition to
consume filtered coverage. Current-hit distances and spatial RGBA are unchanged;
published xyz never comes from history. A neighborhood with no cloud support
still publishes transparent/invalid data immediately.

For phased medium, available transparent history passes only with compatible
opaque scene depth and mean-ray alignment. Cloud-bearing history additionally
keeps A13 longitudinal support and foreground constraints. Qualified gamma-1
clipping replaces the medium-only 0.08 transmittance cutoff; the RGB gate,
0.9/0.82 weights, global cuts and independent shadow-length processing remain.
High/low and Planar retain their previous path. No new lookup, uniform,
resource, render pass, API or producer/material/time change is introduced.

The new actual-GPU witness alternates the traced center between hit and miss,
starts with transparent history, compares against the independently known
0.9 recurrence, and checks current-domain anchor publication. Restoring the old
hit-only policy produces the unfiltered center on both transition directions.
It also checks moving/advection support, previous opaque-depth disagreement
and immediate removal of all local cloud support. Existing foreground,
unsupported-distance, wrong-UV, linear/log-depth and first/cut witnesses remain.
The aerial consumer was inspected: its validity check makes the anchor bit
change necessary, rather than merely allowing invisible history in the MRT.

## Initial automated evidence

First-candidate commands use actual WebGL in Chrome 152 on Windows, each with
`--failTaskOnError`:

| `npm run test -- --includeName` selection                                     | Result   | Fixture time |
| ----------------------------------------------------------------------------- | -------- | ------------ |
| `reconstructs phased Globe medium clouds across depth and camera transitions` | 1/1 pass | 159.848 s    |
| `isolates cloud radiance scale transitions from temporal history`             | 1/1 pass | 51.711 s     |
| `executes one lazy cloud MRT and resizes only for quality`                    | 1/1 pass | 38.843 s     |

The first long synchronous fixture disconnected Karma's heartbeat. Yielding
between GPU batches then exposed Jasmine's default async timeout and early
cleanup. The fixture now yields without any extra render and declares a bounded
300 s timeout, consistent with its measured 160 s runtime. No product workaround
or upstream test-runner change was made. An attempted combined name filter
selected zero tests because it is literal; the final selections ran separately.
Only the three successful final-source runs above qualify the candidate.

ESLint and explicit Spec Prettier checks pass. Mandatory full AgentDocs
markdownlint passes. Full AgentDocs Prettier still reports the same 16 unrelated
historical/template files recorded before A15; changed records are formatted.
GLSL is compiled by the GPU tests; generated shader JS/barrels/Build output
are not manually edited or committed. Final whitespace/ownership checks are
recorded in the phase handoff.

## Initial native view, motion and cost

The owner camera/parameters are those recorded in the diagnosis, at 1900x1150,
medium/mixed, coverage 0.26, density 0.5, radiance 3 and cloudTime 0. Device:
ANGLE D3D11, NVIDIA GeForce RTX 3060 Ti, Chromium 152.

Before reloading the page, a temporary corrected shader uses the same native
low-resolution inputs, depth, matrices and offsets as the old native resolve.
Its private ping-pong history starts from the old native history and then
evolves independently. The product history/output is never overwritten.
Across 16 consecutive native frames, a 700x380 region at drawing-buffer
`(400,430)` contributes 392498 thin-band pixel transitions. Band membership is
max opacity of both versions across each frame pair in `(2/255,64/255]`.
RGBA8 readback measures mean absolute opacity change: old **0.038136**, corrected
**0.008240**, a **78.39% reduction**. This is a local coverage-variation measure,
not final RGB error, universal quality, or disappearance of every visible grain.

The page is refreshed onto the generated corrected bundle. Current source is
verified in the native resolve program. A 60-frame camera translation at
2 m/frame with Clock playback reports `continuous-reprojected` in all frames,
ready HDR and zero browser/render errors. Bounded screenshot inspection shows
continuous cloud forms; controlled removed-support/occlusion witnesses provide
the stronger regression evidence against stale clouds. This does not establish
all-speed motion or ghost-free quality.

Initial page restoration incorrectly interpreted stored TAI JulianDate fields
as UTC; that temporary 37 s offset was corrected with `JulianDate.clone`.
Camera position, time `(2461212,81037)`, cloudTime 0, pause and 1900x1150 buffer
are restored; orientation differs only by floating-point normalization. Final
scalar verification finds coverage/density/radiance now at **0.3 / 1 / 2.8**,
with the other captured values unchanged. Those subsequent interface changes
are preserved, rather than overwritten; their timing/origin is not established.
The pre-reload paired quality measurement is unaffected.

Two 60-frame native cadence windows give median **16.60 / 17.80 ms**, mean
**16.50 / 19.26 ms**, p90 **20.50 / 20.80 ms**. The later window verifies the
restored time and canvas but does not capture all cloud scalars. Given the final
parameter changes, these windows are not a qualified same-workload performance
comparison. No whole-page FPS regression/improvement conclusion follows.

After test completion, 12 same-native-input GPU timer pairs alternate old/new draw
order in temporary full-resolution targets, following one unmeasured program
initialization draw each. No disjoint event occurs. Resolve GPU median is
**1.992 -> 2.029 ms** (about **+0.036 ms**, 1.8%); means are **3.252 -> 2.904 ms**,
with spikes in both sets (max 10.685 / 7.945 ms). Both commands consume identical
bound native textures/uniforms within each pair, so later parameter changes
do not invalidate this paired comparison. These observations do not show
a consistent large resolve-cost increase, but do not establish sustained FPS.
All temporary callbacks, queries, shaders and framebuffer attachments from
quality, motion, cadence and timer checks are released. Native input and render
loop remain enabled, with one ready controller and zero sample errors.

## Initial findings and disposition (superseded)

- **A15-AR-001 / high / fixed / Execution Agent:** stochastic hit/miss coverage
  discarded history. Current support anchors and continuous medium coverage
  repair the diagnosed mechanism; the alternating GPU witness and paired
  native measurement discriminate the previous implementation.
- **A15-AR-002 / medium / open / owner with Architecture Agent:** final visual
  acceptance of stationary edges and moving trails remains. The current page
  is ready at the original view. Simultaneous neighborhood misses can retain
  some grain, and adjacent-volume association may retain short trails. Do not
  activate a successor or claim universal zero jitter from proxy measurements.

The owner rejects the first candidate's visible near/horizon edge jitter.
A15-AR-002 now blocks quality approval and the checkpoint. The phase's second
correction targets the residual HDR threshold and stationary longitudinal
rejection. Prior automated results remain evidence for the first candidate;
updated implementation and relevant verification are pending. No push.

## Second correction after owner rejection

The following evidence supersedes the first candidate's code disposition;
A15-AR-002's latest owner feedback is recorded below. The product delta adds no
resource or lookup. Medium relies on qualified gamma-1 clipping for HDR RGB,
and exact-stationary rays skip only stochastic longitudinal interval matching.
Nonnegative distance, foreground, scene-depth and ray-alignment checks remain.
Moving frames retain the longitudinal interval. Source inspection confirms
that the existing stationary predicate requires exact cloudTime, cloud offset,
frustum, camera basis/position, primary light direction and scale equality;
global continuity cuts precede history use. No approximate motion threshold
or new stationary flag is introduced.

The owner's second reproduction uses medium/mixed, coverage 0.3, density 1,
radiance 2.8, cloudTime 0, and the same 1900x1150 device/browser as above:

- Position: `(4365199.7406139085, 1161265.828842196, 4489578.8382261135)`.
- Direction: `(-0.8278939876572943, 0.20649519092503435, 0.5214894834277463)`.
- Up: `(0.5584661605598789, 0.21723487610028563, 0.8005776390302201)`.

Eight native gate-probe frames use a band with maximum current/previous
opacity in `(2/255,128/255]`. Horizon reuse is 96.43%, near reuse 97.06%, yet
rejected history accounts for 46923/60143 horizon and 35581/58096 near opacity
changes above 10/255. The RGB gate rejects 36028 and 33065 samples respectively;
distance rejection affects 25055 and 9716. These counts overlap. Opaque scene
rejection is zero. Remaining jumps are concentrated failures despite high
overall reuse, so the previous broad opacity score was insufficient evidence.

Two private experiments isolate RGB rejection, then stationary distance
rejection. The final-source comparison additionally preserves the independent
foreground/nonnegative checks exactly as shipped in this candidate. It shares
native inputs with the first A15 shader, maintaining separate temporary history
for the new candidate across 16 frames. No product history is overwritten.
The 1500x580 region at drawing-buffer `(150,380)` covers near and horizon clouds.
Membership is maximum opacity across both versions and the frame pair above
2/255; it includes dense clouds rather than selecting only transparent fringes.

Brightness is a bounded diagnostic: linear cloud RGB luminance
`L=dot(rgb,(0.2126,0.7152,0.0722))`, compressed as `L/(1+L)` into RGBA8.
It is not the final atmosphere/tone-map image. Among 8257712 pixel transitions,
brightness changes above 10/255 decrease from **316875 to 45557 (85.62%)**;
total absolute compressed-brightness variation decreases from 22988371 to
7884580 (**65.70%**). Mean opacity change decreases from 0.010581 to 0.002973
(71.90%). These are relative to the rejected first A15 candidate at this new
view; they must not be multiplied by the earlier different-view percentage.
Residual changes remain and numerical improvement does not pass the owner gate.

The actual-GPU fixture adds independent expected HDR values (1.8 RGB / 0.82
transmittance), an old-RGB-threshold negative control, stationary random-depth
history and the same unsupported history during advection. The existing
zero-tent interval witnesses now run with a real 1 m cloud-offset change, while
finite foreground rejection is explicitly stationary. The focused phased
fixture passes **1/1, 169.118 s**. The first legacy/radiance-cut run fails its
existing 5 s resource-publication poll, before its render assertions; the
isolated unchanged-source rerun passes **1/1, 53.320 s**, exit 0. No timeout or
product change is introduced for this failure. Previous lifecycle evidence is reused because
resource ownership and lifecycle code are unchanged.

The page loads the corrected native shader and restores captured scalar values
without differences, exact TAI time and camera position. A 60-frame camera/
Clock run records one initial camera-cut publication and 59 continuous
reprojected frames, with zero sample errors, then restores the original view
and pause. Temporary listeners/resources are released. Screenshot crops are
not used as quantitative temporal evidence; some capture calls return an
incorrect region while live camera/canvas bounds remain unchanged. The native
page is the owner-visible acceptance surface.

- **A15-AR-003 / high / fixed / Execution Agent:** magnitude-based rejection of
  qualified HDR history. Fixed by the medium RGB clipping policy and verified
  by the HDR expected-value and old-gate negative-control draws.
- **A15-AR-004 / medium / fixed / Execution Agent:** identical integration rays
  lose history through stochastic cloud-distance changes. The stationary/moving
  discriminating witness verifies the narrower interval rule; the stationary
  finite-foreground witness prevents treating this as an occlusion bypass.

After regression completion, 12 same-native-input GPU timer pairs compare the
first A15 shader with this corrected shader, alternating draw order after one
unmeasured initialization draw each. No disjoint event occurs. Resolve medians
are **2.033 -> 1.741 ms**, means **1.889 -> 1.790 ms**, with maxima **2.229 /
3.039 ms**. These bounded pairs show no consistent resolve-cost increase;
they do not establish sustained page FPS. All queries, temporary targets,
programs and callbacks are released.

On 2026-09-11 the owner inspects the corrected native page and reports
**“已经好很多了”**. This confirms substantial visible improvement and supports
retaining the current candidate. Code review approves the narrow correction
with the GPU, foreground/motion and cost evidence above. A15-AR-001/003/004
are fixed. **A15-AR-002 remains open for formal phase acceptance**, owned by
the owner with Architecture Agent; positive feedback is not restated as zero
grain or acceptance of all moving views. Remaining quality limits are local
support loss and possible short trails at adjacent cloud volumes. No further
tuning is assigned, and no successor phase is activated. A15 is uncommitted
and unpushed; no upstream-owned files or SGP change.

## Architecture closure — 2026-09-11

The owner's positive visual feedback is followed by moving to the next issue
and authorizing its implementation. Architecture therefore accepts A15-AR-002
for this bounded correction and closes the phase, retaining the documented
sampling/adjacent-volume limitations rather than claiming universal zero jitter.
All implementation findings are fixed; previous GPU, motion and paired-cost
evidence is sufficient and is not rerun. Earlier pending-gate statements are
superseded by this disposition. The commit containing this record is the
isolated A15 checkpoint; model-lighting diagnosis/implementation is excluded.
No upstream-owned files, SGP changes or push.
