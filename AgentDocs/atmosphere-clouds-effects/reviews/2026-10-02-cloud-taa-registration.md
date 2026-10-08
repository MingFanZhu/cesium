# 云与 TAA 配准评审

- Type: review
- Status: approved for owner-requested checkpoint; known validation limits retained
- Author / owner: current task, architecture self-review
- Updated: 2026-10-08
- Target: [standalone plan](../plans/2026-10-02-cloud-taa-registration.md)
- ADR: ADR-0048, ADR-0094
- Upstream-owned files changed: none
- SGP: none added or modified; existing SGP-0022 jitter seam consumed

## Findings and disposition

**P1 — environment/geometry sampling mismatch: corrected.** Background and
aerial rays consume the scene render jitter. Cloud trace, resolve and history
use stable Camera rays, with explicit UV translation for depth lookup and final
composition. Camera/culling/picking remain unchanged. Packed semantic alpha is
never filtered; each composite tap passes foreground visibility before its
premultiplied radiance/transmittance is combined.

**P1 — TAA jitter treated as physical cloud-ray motion: corrected.** The initial
2026-10-02 implementation shared the jittered frustum with cloud history. The
owner rejected the increased flicker. Its longitudinal gate rejected about 3.5%
of supported cloud pixels with TAA versus 0.5% without. The stable cloud frustum
now preserves the existing exact-stationary path. Physical camera/cloud movement
still uses continuous reprojection and the unchanged distance/visibility gates.

A qualified bilinear history candidate only reduced RGB variation from 1.576 to
1.293, while raising cloud resolve from 0.715 ms to 0.909 ms; it was discarded.
A Catmull-Rom composite candidate did not improve the selected result and was
also discarded. These algorithms are not present in the delivered source.

## Evidence

- Focused Chrome Headless 154 / WebGL-validation Specs: four actual-render
  cloud/TAA cases cover Globe/Planar, perspective/orthographic, all eight jitter
  phases, depth-coordinate registration, stable cloud history, disabling TAA,
  continuous camera movement, unmodified Camera projection, resource reuse and
  release. An additional GPU composite test checks fractional translation,
  foreground rejection, invalid packed samples and zero-jitter compatibility.
- Thirteen existing TAA Specs pass, including surface detail, subpixel railings,
  motion, disocclusion, MRT/depth registration and lifetime. Eight procedural-star
  Specs pass. The orthographic motion fixture explicitly retains its width after
  Cesium move(), since Globe otherwise adjusts width to camera altitude; that
  automatic projection cut is not continuous translation.
- The two older phased-cloud reconstruction fixtures still have separately
  tracked strict-validation failures: both reproduce `INVALID_OPERATION` in
  background rendering on unchanged checkpoint `4de79490f6`. They are not
  reported as passing and were not repeatedly rerun for this follow-up.
- Current Globe medium page, paused Clock, same view, 1001 x 826 drawing buffer,
  280 x 170 sky crop, 64 frames: adjacent-frame RGB difference changes from
  **1.576 to 0.863** with TAA (about 45% lower); without TAA it remains **0.622**.
  This is a diagnostic, not perceptual acceptance. Residual combined flicker is
  still measurable and cannot be described as fully eliminated.
- Actual disjoint-timer query: selected cloud resolve median **0.768 ms**, cloud
  composite **0.087 ms**, 24 samples each. Earlier jittered resolve was 0.715 ms
  on this device. No new pass, attachment or cloud trace sample is introduced;
  the active-jitter composite adds up to six texture reads. No FPS claim.
- Live Globe translation/rotation: 15 moving frames take the reprojection path,
  resources are reused, and no browser render error is reported. The user's
  original view, Clock and TAA setting are restored. A TAA-on screenshot is saved
  as a local Build artifact; it does not substitute for moving visual acceptance.
- Full `gulp buildRelease` succeeds. No generated files are part of the change.
- The 26 distinct relevant Specs pass across the scoped runs; only the corrected
  orthographic fixture was rerun after its width setup change. Scoped ESLint,
  Prettier and diff whitespace checks pass. Ownership comparison against the
  official baseline confirms no changed upstream-owned file.

## Remaining limits

**P2 — existing phased-cloud fixture WebGL validation failures: deferred.** Owner:
architecture / future cloud reconstruction work. Diagnose their background draw
and render/controller lifecycle before using them as a strict-validation gate.
The focused combined regression supplies direct contract evidence for this fix.

**P2 — residual stochastic grain and resampling variation: visual acceptance
pending.** The measured TAA-on result remains above TAA-off. Cloud motion vectors,
a new denoiser and changes to opaque-depth-based scene TAA are outside this fix.
The owner rejected the terrain-backed noise on 2026-10-04. The specific failure
and its disposition are recorded below; residual general cloud grain remains
subject to moving visual judgment.

## 2026-10-04: Terrain-backed cloud noise

**P1 — stationary cloud history falsely rejects jittered sloped receivers:
fixed.** The owner's close-cloud view separates clear sky from terrain behind
the same clouds. Stable cloud rays read different rasterized terrain samples
under TAA jitter. The scene-distance gate accounted for storage precision and
ray footprint, but not the receiver's local slope. This discarded history and
exposed current stochastic cloud samples over the terrain.

The cloud snapshot now retains the previous depth UV offset. For stationary
integration rays only, scene-distance qualification includes continuous
receiver slope times actual inter-frame pixel displacement. Four neighbor depth
reads select the finite continuous side of each axis; a silhouette jump or sky
sample cannot widen tolerance. Moving rays, equal jitter, clear/finite classes,
cloud occlusion gates and weights keep their original behavior. No scene TAA
shader, new attachment, rendering pass, API or upstream file is changed.

- Actual cloud resolve diagnostic, owner's paused Globe medium view, 300 x 140
  finite-depth crop over 16 frames: scene-distance rejection with TAA falls from
  **103596 / 672000 (15.4%) to 0 / 672000**. Total cloud rejection becomes about
  1.49%, comparable to 1.47% with TAA disabled. The screenshot's terrain-backed
  noise layer visibly reduces; the sky path is unchanged.
- Five focused WebGL-validation Specs pass. Four actual-render cases also check
  previous jitter snapshot publication, perspective/orthographic and both worlds,
  continuous movement, TAA transitions and resource release. The new real GPU
  test accepts the jittered sloped receiver while rejecting a 5 km receiver
  change, a near/sky silhouette and clear-depth mismatch. Moving-ray and
  zero-jitter cases retain the original gate.
- The GPU fixture initializes the scene frame before setting UniformState;
  its first setup-only failure occurred before shader execution and was corrected.
  Only that fixture was rerun after fixing setup, rather than the full suite.
- Same-view GPU query, 24 samples per mode: cloud resolve median **0.722 ms**
  with footprint disabled versus **0.741 ms** enabled, about **0.02 ms** added.
  The temporary diagnostic overrides and resources are restored/destroyed.
- The user's view, time, quality and enabled TAA are preserved. Visual proof is
  a local Build artifact. This resolves the diagnosed receiver-history failure;
  it does not promise noise-free stochastic volume rendering.
- Full release build, scoped ESLint/Prettier and whitespace checks pass. The
  final browser build renders without reported errors. All changed runtime and
  test paths remain SceneGIS-owned; no new or modified upstream SGP is needed.

## 2026-10-07: Terrain horizon leaks through clouds

**P1 — Globe receiver plane crosses the sky/terrain discontinuity: fixed.**
With TAA disabled, the identified horizon pixel had zero spatial support in two
of four medium phases: six neighbors failed depth classification and the other
three failed the fictitious plane derived by quad derivatives. Reusing Planar's
continuous finite-side eye-space derivative in Globe restores support in every
phase without widening the receiver tolerance or crossing depth classes.

**P1 — opaque depth discontinuity softens an unrelated cloud front: fixed.**
The same pixel's resolved cloud transmittance was zero, but aerial composition
raised it to 109/255 because the visibility footprint included the terrain/sky
depth jump. The footprint now differentiates cloud-front distance only. Live
GPU inspection confirms zero composite transmittance at that pixel and its
neighbors, while genuine near-foreground clipping remains in place.

- Four focused Chrome Headless 155 Specs pass with strict WebGL validation:
  the two new horizon witnesses, stable-grid composite resampling and jittered
  sloped-receiver history. The full resolve witness covers both worlds and all
  four phases; both new witnesses reproduce failure with the former expressions.
  Temporary shader programs, framebuffers and textures are released.
- The existing Planar P12 actual-GPU regression also passes, preserving receiver
  reconstruction beyond packed range and foreground silhouettes. Its legacy
  mutation anchor was updated for the shared receiver implementation.
- Restored owner view, Globe medium, paused Clock, 1001 x 826 drawing buffer:
  no terrain line is visible with TAA disabled or enabled. View, Clock and TAA
  setting are restored after inspection. Visual proof remains a Build artifact;
  owner acceptance is pending, and stochastic grain is not claimed eliminated.
- Actual GPU disjoint-timer query with TAA enabled, 24 samples: resolve median
  **0.758 ms**, p90 **0.763 ms** on this device. This is an absolute bounded-cost
  observation, not a before/after performance comparison. Globe finite receivers
  add up to four depth reads; Planar already performs them. No additional pass,
  attachment, history or cloud trace sample is introduced.
- No upstream-owned file or SGP changes. The older strict-validation fixture
  failures documented above remain outside this bounded correction.
- Full `gulp buildRelease`, scoped ESLint, Prettier, Markdownlint and whitespace
  checks pass. The final browser build reports no render error, and the original
  TAA-off state is restored for owner review.

## 2026-10-07: Rotation and zoom grain

The owner accepts the horizon correction, but reports severe grain during
camera operation. This remains a separate quality failure from the resolved
horizon leak and stationary TAA receiver footprint.

**P1 — cloud/receiver parallax falsely rejects history: fixed.** At the current
Globe medium view, paused Clock and TAA off, 24 frames of 20 m/frame forward
motion rejected receiver history for 1,367,671 of 2,123,388 eligible finite-depth
samples (64.4%). Static rejection was zero; global history stayed valid. Rotation
at 0.0015 radians/frame rejected about 1.7%, so history reset alone did not
explain its residual grain. A cloud-anchored previous ray sees a different point
on the same background surface. Moving phased history now tests continuity
against the existing current receiver plane, retaining the old precision
tolerance and separate cloud-front/support checks. The repeated forward path
has zero scene-gate rejections in the diagnostic crop; cloud-distance rejection
remains active. This is not removal of all history qualification.

**P2 — nearest history quantizes continuous motion: improved.** Moving phased
history now reconstructs four bilinear taps. Every tap separately qualifies
receiver continuity, cloud support, foreground and its ray footprint; only
premultiplied RGBA is combined. Packed metadata is never interpolated. Missing
support reduces the existing 0.82 history weight. Stationary history, shadow
history, trace budget, current-domain depths and resource ownership are unchanged.

### Evidence and remaining limits

- Actual product shader GPU fixture passes in both worlds: continuous receiver
  parallax, fractional color reconstruction, per-tap foreground exclusion,
  changed receiver, unsupported cloud depth and current foreground rejection.
  Mutating back to nearest reconstruction loses the expected fractional value;
  mutating receiver qualification back to point equality rejects valid parallax.
  The initial fixture translation stayed inside its coarse 8x8 pixel tolerance;
  increasing the controlled translation makes the old-rule witness discriminating.
  Only the affected fixture and related Planar regression were rerun afterward.
- Six distinct strict-WebGL Specs pass across these runs: new motion test,
  horizon phases, sloped receiver jitter, composite opacity, composite resampling
  and the existing Planar P12 range/silhouette test. Temporary programs, textures
  and framebuffers are released; product resources and lifecycle are unchanged.
- Same starting view, 32-frame path, 0.0015 radians rotation plus 20 m forward per
  frame, TAA off: original and corrected programs show visibly lower cloud grain
  over terrain after correction. Pure rotation is also compared separately.
  Comparisons use the original vertex shader/attribute bindings and replace the
  fragment program at actual draw time; earlier invalid diagnostic captures
  are discarded. No whole-image blur or additional trace sample was used.
- GPU timer queries on the same combined-motion path, 23 available samples per
  variant, no disjoint: median resolve **0.713 ms -> 1.208 ms**, p90
  **0.720 ms -> 1.219 ms** at 1001 x 826. Extra cost is about **0.50 ms** for
  moving phased pixels, with up to eight extra history reads and qualification
  arithmetic. No additional pass, attachment or persistent resource.
- The plane is a local approximation: depth discontinuities, newly revealed
  regions and large camera cuts still discard history. Limited ray samples,
  thin fringes and near-volume motion can retain grain or slight reconstruction
  softness. This is not UE quality equivalence or owner visual acceptance.
- This follow-up changes only SceneGIS-owned Shader, Specs and documents.
  No upstream-owned file or SGP is added or modified. The earlier unrelated
  strict-validation fixture failures remain recorded, not reported as passing.
- Full release build and scoped ESLint, Prettier, Markdownlint and whitespace
  checks pass. The combined motion path also renders with TAA enabled. The final
  browser build has no reported render errors; original camera, paused Clock,
  medium quality and TAA-off setting are restored. Owner motion acceptance is
  still pending.

## 2026-10-08: Accelerated playback history loss

**P1 — simulation seconds mistaken for a render discontinuity: fixed.** In the
owner's 60x, medium-quality, TAA-enabled view, the previous one-second cutoff
discarded history on 55 of 96 live frames. Simulation deltas were 0.942–1.068 s;
wind displacement remained around 20 m/frame. The same cutoff affected shadow
history. Both now share a physical-advection check against the existing 25 km
translation budget. Unwrapped travel rejects whole-period seeks; published
offset distance rejects modulo jumps. Caller time is neither clamped nor slowed.

### Evidence and scope

- Same camera, clock origin and 48 rendered steps of 1.2 simulation seconds:
  before, all 48 frames discard history; after, 47 retain history and only the
  initial seek resets. Saved before/after captures show substantially reduced
  cloud grain over terrain. They are bounded diagnostic artifacts under ignored
  `Build/`, not committed assets or a substitute for owner visual acceptance.
- Live 60x playback with TAA on: 96/96 frames retain history, no reset reasons.
  Render interval median 16.7 ms, p90 17.7 ms on the measured device. This is
  runtime regression evidence, not a GPU speedup claim. Only CPU continuity
  arithmetic changes; no Shader, trace budget, history weight, pass or texture
  is added. Existing reprojection does execute more often as intended.
- New actual-pipeline Specs pass with strict WebGL validation in both worlds:
  forward/reverse two-second steps; 40 km and full-period seeks; forward/reverse
  modulo crossings; zero-wind time changes; cloud and shadow history qualification
  at draw time; framebuffer reuse and texture destruction on disconnect.
- The warm-discontinuity fixture now uses a genuine 40 km seek instead of a
  1.5-second step. It passes without strict validation. Under strict validation,
  its background draw reports `INVALID_OPERATION`; enabling its atmosphere did
  not resolve that error and the trial was reverted. This unresolved fixture is
  not reported as a strict pass. The new tests do pass strict validation.
- Lighting/material/camera cuts and per-pixel cloud/receiver gates remain active.
  Newly revealed regions, offset wraps and truly large light/position changes
  can still lose temporal support. Finite sampling still limits extremely fast
  motion; this fix removes the diagnosed artificial time threshold.
- Only SceneGIS-owned renderer, Specs and documentation change in this follow-up.
  Upstream-owned files changed: none. SGP added or modified: none.
- Release build, scoped ESLint, Prettier, Markdownlint and whitespace checks pass.
  The example reports no browser errors and retains the owner's camera, medium
  quality, TAA and 60x playback settings for visual acceptance.

## Checkpoint disposition — 2026-10-08

The owner approved committing this result before starting a new major stage.
Technical review supports the bounded cloud/TAA, horizon, motion and accelerated
playback corrections described above. Earlier pending-acceptance statements are
historical; they do not imply another active implementation phase.

The strict-WebGL background-draw fixture errors remain open maintenance findings,
not passing results. Their next owner is the architecture/implementation role
assigned to atmosphere maintenance; isolate the affected resource/attachment
lifecycle in a follow-up plan before expanding validation. Finite-sampling grain
and the measured moving-history GPU cost remain documented limitations.
No new phase, upstream-owned delta or SGP is introduced by this checkpoint.
