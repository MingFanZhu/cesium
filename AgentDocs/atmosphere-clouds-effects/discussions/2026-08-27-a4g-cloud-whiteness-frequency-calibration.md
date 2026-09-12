# A4-G Globe Cloud Whiteness and Frequency Calibration

## Metadata

- Type: `discussion`
- Status: `design resolved by Architecture; A4-AR-030 implementation assigned`
- Author role: Architecture Agent
- Updated: `2026-08-27`
- Parent phase plan:
  [A4-G Globe reference-first integrated cloud core](../plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md)
- Current review:
  [A4 volumetric cloud core review](../reviews/2026-08-15-a4-volumetric-cloud-core.md)
- Governing decision:
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Reference authority: `yuwoniu03/cesium-clouds-atmosphere@1f38602b84ab5c3f2bc289f9e4464df3db917155`
- Finding: `A4-AR-030`

## Owner finding

The project-owner Globe visual gate after `A4-AR-029` is `No-Go`. Globe clouds
remain too grey to read as sunlit white clouds, and the distant cloud deck is
still too soft and low-frequency. The owner explicitly permits a bounded visual
enhancement. This reopens A4-G without reopening the accepted coordinate repair.

## Source facts

The Cesium reference does not publish its raw cloud radiance unchanged. In
`src/ThreeGeospatialPipeline.js#getCloudFragmentShader` it divides by cloud
alpha, applies default `cloudExposure=3`, `ACESFilmic`, gamma `1/2.2`, and a
magenta-reduction correction. Its defaults also include `sunIntensity=20`.
Those operations deliberately push displayed clouds toward a bright white
result, but they are a cloud-local second display transfer and remain
incompatible with the SceneGIS single linear-HDR/display-transfer authority.
They must not be copied into the product shader.

The reference default macro shape coordinate is
`shapeRepeat=4.1 / 10000 m`, corresponding to a period of approximately
`2439 m`. The current Globe adaptation uses private macro periods of `10000 m`
for cumulus, `13000 m` for mixed low cloud, `22000 m` for stratus and `30000 m`
for cirrus. It also derives full shape/detail LOD from the conservative ray and
step footprint, while the reference applies default `mipLevelScale=0.35`.
Therefore the current Globe product intentionally presents substantially lower
spatial frequency and stronger distant filtering than the visual reference.
This is the first source-backed cause of the soft distant deck.

SceneGIS currently keeps raw cloud radiance linear and applies the public
`cloudRadianceScale` only at MRT publication. This is the correct ownership
boundary, but the previous numerical gate established linearity rather than an
owner-acceptable white-cloud display. Reference-shaped lighting equations alone
cannot guarantee visual parity when the reference adds its own cloud-local
display transform.

## Architecture diagnosis — 2026-08-27

Architecture, rather than Execution, ran the fixed reference comparison and the
SceneGIS parameter isolation. The reference service was moved to port `8100`
because `8081` was already occupied by a SceneGIS Node process. No reference
binary, runtime dependency or product source was copied.

The first owner-gate defect is semantic rather than radiometric. The A4-G
mid-latitude camera is fixed at longitude `15 degrees`, geodetic latitude
`45 degrees`, but the generic Test `day` preset remained
`2026-06-21T04:00:00Z`. The actual compiled Globe Sun direction gives local
solar elevation `6.229 degrees` there. The button labeled `sunset` uses
`10:30:00Z`, which is actually a high-Sun `67.484 degrees` view at that
location. A warm grey cloud under the former input is physically expected; it
cannot be used as evidence for a noon white-cloud default.

The second defect is genuine calibration. With the accepted solar-normalized
source equations, private macro scale `0.25`, fixed high Sun and actual Cesium
PBR Neutral display transfer, the representative Globe cumulus cloud-only
display measured as follows:

| Public scale | Display Y p10/median/p90 | Median RGB    |
| ------------ | ------------------------ | ------------- |
| `24`         | `97.43/162.56/175.70`    | `166/162/158` |
| `40`         | `123.00/208.56/224.56`   | `213/208/202` |
| `48`         | `111.72/224.84/233.77`   | `230/224/218` |
| `64`         | `145.96/236.89/240.89`   | `222/241/241` |

Scale `24` remains visibly grey. Scale `48` produces near-white lit regions
while retaining dark cavities and leaves explicit headroom below the public
maximum. Scale `64` enters visibly stronger highlight compression and flattens
the upper distribution. In fully combined high-Sun output, scale `40` and `48`
produced median/p90 Y `195.67/215.43` and `208.95/229.50`, respectively; scale
`48` is the first bounded candidate that matches the owner's requested white
cloud impression without a uniform slab. The accepted earlier forward-light
maximum at scale `10` was `3.1328125`, so linear scale `48` remains orders of
magnitude below the RGBA16F `65504` storage guard.

Architecture also compiled the reference Sun/sky topology as a temporary
mutation. At high Sun it moved the raw Globe CIE xy from the retained source's
approximately `(0.32093,0.33573)` to `(0.30133,0.32978)` and did not repair the
low-Sun olive result. It was restored before assignment. The accepted
component-wise solar-normalized Sun/sky adapter is therefore not reopened for
this visual finding.

The third defect is distant filtering. At the same final display, changing only
the Globe footprint LOD factor from `1.0` to `0.5` increased interior five-pixel
high-pass mean from `0.46535` to `0.54576` (`+17.3%`) and Laplacian mean from
`1.96516` to `2.14120` (`+9.0%`), while reducing horizontal/vertical gradient
anisotropy from `2.250` to `1.681`. Lowering it again to reference-like `0.35`
added only `3.7%` high-pass energy over `0.5`; the low-Sun sweep exposed visible
ray-aligned streak/banding under SceneGIS's bounded march budget. The bounded
adaptation is therefore `0.5`, not a literal copy of reference `0.35`.

The retained private macro scale `0.25` is accepted. It converts the current
per-preset `10–30 km` periods to `2.5–7.5 km`, bringing low cumulus close to the
reference default `2.439 km` without changing assets, coverage or public
morphology. Architecture's reference frequency sweep independently showed that
the reference's `1 -> 4` frequency change increased mean edge energy by about
`20.1%` and strong-edge density by about `24.9%`, supporting this causal
correction.

## Converged implementation decision

Execution is assigned only the following implementation:

1. Retain `SCENEGIS_GLOBE_CLOUD_MACRO_SCALE = 0.25` and change only
   `SCENEGIS_GLOBE_CLOUD_LOD_SCALE` from `1.0` to `0.5`.
2. Change the public `cloudRadianceScale` default from the unreviewed partial
   candidate `24.0` to `48.0`. Keep its finite `[0,64]` range, setter, history
   identity and exactly linear raw-MRT semantics. Synchronize constructor,
   JSDoc, public Specs, installed-package smoke and Test controls.
3. Replace the partial A4-AR-030 Spec's cloud-local scalar ACES approximation.
   SceneGIS's real path composes Cloud MRT into scene-linear HDR and then uses
   Cesium's global PBR Neutral tonemapper; a premultiplied cloud-local ACES model
   is not a valid final-display authority. Raw GPU tests must measure internal
   luminance high-pass/gradient energy separately from active-mask transitions,
   and final-display evidence must come from the real Cesium scene.
4. Add location-aware A4-G owner-gate lighting presets. At longitude `15
degrees`, latitude `45 degrees`, use `10:30Z` for high-Sun day
   (`67.484 degrees`), `18:30Z` for sunset (`2.175 degrees`) and `22:00Z` for
   no-moon night (`-20.120 degrees`). Report the actual local solar elevation in
   the evidence. Preserve the generic dual-world presets; do not relabel a
   low-Sun frame as noon or use time to hide a product defect.
5. Keep the accepted dual-HG phase, eight-octave transport, Sun/sky adapters,
   local powder, Beer-Lambert integration, WGS84 anchor, cube-face mapping,
   assets, occupancy, depth/composition and temporal ownership byte-for-byte
   unchanged. Add no cloud-local tone map, tint/clamp, hidden multiplier,
   resource, pass, program, texture, FBO or Planar-specific correction.

The focused raw fixture must cover at least scale `0/1/48`, exact non-RGB
attachment invariance, finite/bounded complete RGBA16F output, scale linearity
and forward-light storage safety. The LOD fixture must prove that `0.5` raises
interior spatial-frequency energy over `1.0`; active-mask edge density alone is
insufficient. Final-source browser evidence must cover high-Sun, true sunset and
night at equator and 45 degrees, ground and above-cloud, cloud-only and fully
combined, and must preserve internal cavities, sunset warmth, night zero and
stable replay.

`A4-AR-030` remains blocking until Execution returns the exact implementation
and Architecture independently re-reviews it. The tree stays
uncommitted/unpushed; owner gate, checkpoint, A5-G and Planar work remain
blocked.

## Execution result — 2026-08-27

Execution applied the converged design exactly: Globe macro remains `0.25`, LOD
is `0.5`, and public/JSDoc/Test/package default is `48.0` with unchanged
`[0,64]` and linear semantics. The partial Spec-local scalar ACES function was
deleted. Its replacement compiles the real Globe library and separately measures
active-mask transition density plus source-luminance gradient, Laplacian and 3x3
high-pass energy over fully active interior neighborhoods. LOD `0.5` passes all
three independent `> 1.05x` interior-frequency assertions over `1.0`; macro
`0.25` retains its `> 1.25x` transition-density mutation authority.

The actual-GPU `0/1/48` fixture passed in Globe/Planar and linear/log programs:
scale-zero RGB is exact zero, scale `48` is half-float-linearly related to scale
`1`, alpha and the complete distance attachment are bit invariant, all decoded
values are finite/in bounds, and the storage guard is not approached. The Test
owner controls now expose the exact high-Sun/sunset/night UTC inputs and report
live geodetic solar elevation. Browser evidence uses the actual composed Cesium
scene, not a copied display formula.

The same-source high-Sun cumulus/mixed matrix covered equator/45-degree,
ground/above and cloud-only/combined (`16` rows). Raw median Y ranged
`1.0083–1.2661`, raw absolute RGB maximum was `1.34375`, nonfinite and attachment
bound counts were zero, and actual displayed p90 Y ranged `0.7587–0.9289` with
maximum displayed RGB `0.9765`. Lit regions are near-white with visible internal
cavities and materially denser distant variation; no viewport-wide white slab
or storage clipping appeared. At `45 degrees N`, sunset measured `2.175 degrees`
and preserved `R > G > B` (`0.43675/0.16669/0.04150` ground source mean), while
night measured `-20.120 degrees` and raw cloud RGB/luminance were exact zero.
The retained block/ray-step texture under extreme views remains an owner-visible
risk for Architecture and project-owner review.

## Architecture independent re-review — 2026-08-27

The product calibration is accepted. Architecture independently confirmed the
implemented macro `0.25`, LOD `0.5`, public default `48.0`, unchanged linear
source contract, focused actual-GPU/controller/A1/generator/package gates, and
the real high-Sun, true-sunset and no-moon-night outputs. The high-Sun Globe now
reads as near-white while preserving cavities and distant variation; the
remaining extreme-view block/ray-step texture stays an owner-visible risk.

Owner re-gate is still blocked by `A4-AR-031`, a Test-only evidence-integrity
finding. The A4-G four-preset grid incorrectly uses generic
`currentArtifactMode`, so A4-G `Cloud only` is labeled `combined`, does not hide
Globe primitives and captures an unrelated Planar state. The replay helper also
uses exact final-frame hash as its only display gate even though Architecture
reproduced at most one 8-bit LSB of Cesium final-display variation over `2.11%`
of pixels while raw attachments remained bit-exact.

The focused repair must make the A4-G grid Globe-only and state-snapshotted, keep
raw attachment replay exact, and report both truthful `displayExact` and bounded
`displayStable` evidence. Product JS/GLSL, radiometric values, resources and
Planar remain frozen. State=`changes-requested; A4-AR-031 Test evidence repair
assigned`.

## A4-AR-031 execution evidence — 2026-08-27

The evidence page now separates the A4-G preset grid from the generic dual-world
state. The grid is Globe-only, records the complete owner-state snapshot, hides
only Globe primitives for `a4gCloudOnly`, and proves Planar state and primitive
visibility unchanged before/after.

Replay keeps exact resolved color/distance attachment authority while treating
the Cesium final framebuffer as a bounded display result. It reports dimensions,
changed pixels/fraction, maximum channel delta and p10/median/p90 deltas;
`displayExact` remains literal, while `displayStable` enforces the assigned
one-byte, five-percent and `1/255` bounds. The final protocol captures the
actual framebuffer during `postRender`, records 24 controlled renders, and
compares two ordered four-sample groups belonging to a recurring exact
attachment phase. The chosen phase and nonconsecutive indices are visible, so a
single lucky frame cannot pass.

High-Sun, true-sunset and no-moon-night phases recurred `16/20/16` times. All
three had strict color/distance equality, `displayStable=true`, nonfinite
pixels=`0` and browser errors=`0`; night raw cloud RGB remained exact zero and
sunset retained `R > G > B`. Product calibration and transport remain frozen.
State=`review-ready for A4-AR-031 Architecture re-review`; owner gate,
checkpoint, commit/push, A5-G and Planar work remain blocked.

## Architecture A4-AR-031 re-review — 2026-08-27

The Globe-only grid and Planar isolation are accepted. The replay protocol is
not: repeated occurrence is not convergence. The implementation selects one raw
attachment hash group and excludes arbitrary interleaved frames, so its strict
raw identity applies only to a chosen phase. Architecture observed interleaved
alternate phases through capture index `20`; an unscreened comparison changed
`219,392` color and `38,087` distance half-words even though final display stayed
within one LSB over `1.450%` of pixels.

After an explicit convergence prefix, the unchanged product produced `24/24`
identical raw and displayed frames. New finding `A4-AR-032` therefore remains
Test-only and requires one uninterrupted 16-frame accepted run, with only a
contiguous prefix discard and every accepted/intervening frame included in the
gate. The grid must also use and revalidate its immutable owner-state snapshot.
State=`changes-requested; A4-AR-032 contiguous convergence evidence repair
assigned`; product/Planar stay frozen.

## A4-AR-032 execution evidence — 2026-08-27

The rejected dominant-phase selection is gone. The replacement protocol drains
pending RAF work after disabling the default render loop, records eight explicit
convergence renders, then resets a candidate on every raw attachment or bounded
display mismatch until it obtains 16 uninterrupted frames within a 64-render
ceiling. Only the contiguous prefix before the accepted run is excluded. All 16
accepted and intervening frames are included in raw and display authority, with
first-four/last-four nonconsecutive pairs reported separately.

High-Sun, sunset and no-moon-night captures converged after prefixes `22/8/10`
and accepted continuous indices `22-37`, `8-23`, and `10-25`. Each run had a
single display/color/distance hash, stationary history/read index zero, exact
raw attachments and zero bounded-display deltas. Sunset remained `R > G > B`,
night raw cloud RGB remained exact zero, and browser errors were zero.

The Globe grid now uses immutable `snapshot.ownerState` and validates the owner
location/camera/lighting/state/quality plus Planar isolation at completion. Its
final visible capture reported `ownerUnchanged=true`, `planar.unchanged=true`
and `valid=true`. Product calibration, transport, resources and Planar remain
frozen. State=`review-ready for A4-AR-032 Architecture re-review`; owner gate,
checkpoint, commit/push and A5-G remain blocked.

## Architecture A4-AR-032 re-review — reduced evidence contract 2026-08-27

The contiguous-run implementation is faithful to its assignment, but the
assignment over-specified owner evidence. Architecture could not reproduce the
reported high-Sun convergence: two raw Cloud MRT phases continued within the
64-render bound. Atomic inspection ruled out cross-frame reads and a live
default loop; the low Cloud MRT, resolved attachments and final display changed
together. The display difference remains within one LSB over `1.450%` of pixels,
which is already inside the accepted visible-stability boundary.

Strict multi-frame raw identity is withdrawn as an owner gate. The focused Test
repair will use one atomic same-frame display/raw capture for each explicit
state, retain finite/bounds and visible quality summaries plus immutable Globe
state and Planar isolation, and remove convergence loops, phase/hash selection,
replay pairs and substitute gate matrices. Product and Planar stay frozen.
State=`changes-requested; simplified A4-AR-032 evidence repair assigned`.

## A4-AR-032 simplified execution evidence — 2026-08-27

The multi-frame convergence protocol has been removed rather than replaced.
Each selected owner state now produces one controlled render whose `postRender`
callback copies the final framebuffer and raw Cloud MRT attachments before the
promise resolves. The direct report contains raw finite/bounds/storage and
radiometric values, displayed luminance/maximum, measured solar elevation and
immutable owner-state validity only; no replay/hash/phase/convergence authority
remains.

Fresh high-Sun/sunset/night captures were finite and storage-safe with zero
bounds failures. High-Sun raw source RGB was
`1.06725/1.00793/0.94548`; sunset was `0.57202/0.21432/0.04926` and retained
`R > G > B`; no-moon-night raw RGB and luminance remained exact zero. All owner
snapshots were unchanged and browser errors were zero. The accepted Globe-only
grid again reported its exact visible title, hidden Globe primitives,
owner/Planar unchanged, and `valid=true`. Product and Planar remain frozen;
state=`review-ready for simplified A4-AR-032 Architecture re-review`.

## A4-AR-032 final fail-closed evidence — 2026-08-27

The helper now computes raw evidence once and makes `valid` the conjunction of
the existing enabled/ready, owner, raw available/finite, zero nonfinite/bounds,
and storage-safe facts. Exactly two direct calls were made: the fresh disabled/
not-ready state returned `raw.available=false, valid=false`; enabled/ready
high-Sun cloud-only returned the accepted finite/bounded/storage-safe raw result
and `valid=true`. No additional capture, retry, metric or gate was introduced.

Architecture independently reproduced both outcomes and accepts this final
fail-closed boundary. `A4-AR-032` is closed; the discussion now returns to the
project-owner Globe visual gate without reopening product or Planar behavior.

The project owner subsequently reported `通过`. The Globe visual calibration is
accepted and A4-G is closed by its local unpublished checkpoint. No additional
calibration, gate or Planar work is implied.
