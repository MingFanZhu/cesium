# Phase Plan: A4-G Globe Reference-First Integrated Cloud Core

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture and owner accepted`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Supersedes:
  [2026-08-15-phase-a4-volumetric-cloud-core.md](2026-08-15-phase-a4-volumetric-cloud-core.md)
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-27`
- Updated: `2026-08-28`
- Branch: `feature/atmosphere-clouds-effects`
- Retained HEAD: `ad9898261831e1314fe98307b7b0303fce3ba08f`
- Phase checkpoint: `241de41fc36835114a4e9312ad53ca2ac64407b8`（未push）
- Predecessor checkpoint: A3=`43ed40117104e0450bf23dc094b2ab2e602bbfa2`
- Architecture decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Related discussions:
  [Globe-first advanced environment delivery](../discussions/2026-08-27-globe-first-delivery.md),
  [Globe cloud whiteness and frequency calibration](../discussions/2026-08-27-a4g-cloud-whiteness-frequency-calibration.md)
- Open review finding: none
- Upstream patch: active `SGP-0008` (`consume only`)
- Owner visual gate: `passed`

## Goal

Deliver the first accepted Globe-only integrated slice of the advanced environment
stack: Bruneton sky and aerial perspective, SceneGIS exponential height fog,
reference-derived volumetric cloud density and lighting, atmosphere irradiance
skylight, depth-aware geometry composition, and one linear-HDR/display-transfer
authority.

This phase is not a fresh independent approximation. The fixed Cesium reference
implementation is the preferred source for the Globe cloud feature graph and for
audited shader/algorithm adaptations. SceneGIS translates that behavior into its
existing Renderer-owned HDR pipeline instead of copying the reference runtime
container.

## Scope

### In scope

- Globe ellipsoid shell, radial altitude, ECEF camera/Sun geometry, and Perspective
  owner views from ground, cloud interior, cloud top, and near space.
- The accepted A2 Bruneton LUTs and A3 radial exponential height-fog contract.
- Reference-derived multi-layer density/profile/weather/detail/turbulence,
  bounded view/Sun raymarch, multiple scattering, local powder, and
  atmosphere-derived solar/sky irradiance where provenance is complete.
- A single explicit composition model for background, finite geometry, fog,
  aerial perspective, and premultiplied cloud radiance/transmittance/depth.
- Existing cloud-only spatial/temporal resolve only where it remains compatible
  with the adopted Globe source and has deterministic reset/lifecycle evidence.
- Globe-only focused Specs, raw RGBA16F evidence, final-source controls, and owner
  visual captures.

### Deferred

- Any Planar formula, asset calibration, visual parity target, owner gate, or fix
  for the reported Planar fog/cloud composition failure.
- Beer Shadow Map, ground cloud shadow, shadow-length Tyndall/crepuscular coupling,
  and scene skylight consumers beyond the cloud source; these enter A5-G after the
  A4-G checkpoint.
- Stack-wide dynamic performance/temporal policy (A6-G), bloom/lens flare (A7-G),
  and final Globe qualification (A8-G).

## Fixed reference authority

Use
[`yuwoniu03/cesium-clouds-atmosphere@1f38602b`](https://github.com/yuwoniu03/cesium-clouds-atmosphere/tree/1f38602b84ab5c3f2bc289f9e4464df3db917155)
as the Cesium implementation baseline and
[`three-geospatial clouds@b012ad06`](https://github.com/takram-design-engineering/three-geospatial/tree/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/clouds)
as its upstream algorithm source.

Before adopting a file, function, shader block, or binary:

1. record exact commit/path, authorship, license text, and whether the Cesium fork
   changed it from three-geospatial;
2. prove texture dimensions, channel meanings, units, filtering, wrap modes, and
   runtime byte budget;
3. retain required copyright/license notices in source and package provenance;
4. stop on unclear binary provenance and use an independently generated asset
   only when its morphology contract is measured against the reference;
5. do not introduce `three`, GUI, raw `_gl`, PBO, runtime network fetch, or a public
   `PostProcessStage` product dependency.

## Source facts and integration constraints

- Reference `ThreeGeospatialPipeline.init()` registers atmosphere, aerial, and
  cloud stages and separately prepares BSM/temporal work. Its functional coupling
  is authoritative; its postprocess/tone-map order is not.
- Reference clouds consume the Bruneton transmittance/irradiance textures through
  `GetSunAndSkyScalarIrradiance`, retain per-layer height gradients, and share the
  same atmosphere inputs as sky/aerial composition.
- Reference optional `haze` is a cloud-local exponential approximation, not a
  replacement for SceneGIS A3. A4-G must compose the accepted radial height fog
  once and must not add a second haze energy term by default.
- SceneGIS keeps advanced background before geometry and performs integrated
  resolved work before Cesium tone mapping through `SGP-0008`. Cloud radiance may
  not be tone-mapped independently or composited after display transfer.
- Resolved raw exact `0/1` remains the sole clear-depth authority. Finite geometry
  reconstruction must retain the accepted linear/log-depth contract.

## Execution steps

1. Run the fixed reference demo/source locally and produce a concise, persistent
   source map for Globe atmosphere, aerial, cloud density, cloud lighting,
   skylight, composition, and temporal ownership. This map must name exact files
   and functions and distinguish adopted code from retained SceneGIS code.
2. Build a deterministic GPU probe that compiles the reference-derived Globe cloud
   source through the SceneGIS shader environment. Compare selected density,
   transmittance, Sun/sky source, and integrated radiance against the fixed source
   for controlled samples before final-scene calibration.
3. Adapt the Globe cloud core into SceneGIS-owned GLSL/resources. Preserve
   per-layer height/profile behavior, atmosphere irradiance coupling, bounded
   marching, and legal notices; remove reference runtime/container assumptions.
4. Define and test exactly one Globe composition path for sky/background, finite
   geometry, A2 aerial, A3 height fog, and cloud color/transmittance/depth. Toggling
   any component must not change the other components' raw authority or apply the
   medium twice.
5. Keep all Planar adapters and Planar product behavior frozen. Shared changes must
   prove that they do not silently alter the retained Planar path; do not spend
   this phase calibrating or visually repairing it.
6. Update the direct Test with a clearly labeled Globe owner-gate mode and stable
   ground/inside/above/space camera presets. Planar may remain available as a known
   unsupported candidate but must not be presented as an accepted result.

## Validation

- Actual GPU source probes against the fixed reference for density, optical depth,
  Sun source, sky source, transmittance, and premultiplied radiance.
- Globe linear/log variants with exact clear identity and finite/bounded complete
  color/distance attachments.
- Atmosphere-only, fog-only, cloud-only, atmosphere+fog, atmosphere+cloud, and full
  combined matrices. The full output must retain sky/ground separation, geometry
  depth, cloud self-shadow, gaps, and continuous fog/cloud layering without a
  viewport-wide white or gray slab.
- Day, sunset, and no-moon night at ground, inside, above, and near-space views;
  fixed time/camera inputs must replay deterministically.
- Disabled/failure/resize/context/destroy lifecycle and exact resource accounting.
- Focused controller/A1 regression, relevant generator/provenance/package checks,
  changed-scope ESLint/Prettier/Markdownlint, and `git diff --check`.

Numerical gates support diagnosis but do not replace the project-owner Globe visual
gate. No Planar screenshot or cross-world parity statistic is required for A4-G.

## Exit gate

Execution returns a review-ready retained tree and stops. Architecture must perform
an independent source/GPU/browser review, and the project owner must explicitly
pass the Globe-only final-source visual gate. Only then may Architecture create the
A4-G checkpoint and source-discover A5-G. Execution must not commit, push, enter
A5-G, or modify Planar behavior before that gate.

## Execution result — review-ready 2026-08-27

Execution completed the bounded A4-G implementation. The persistent
[reference source map](../discussions/2026-08-27-a4g-reference-source-map.md)
records exact commits, files/functions, license notices, texture contracts, and
adopt/adapt/retain decisions. Opaque reference binaries were not copied because
their file-level generation provenance is not independently documented; the
existing deterministic SceneGIS CloudCore package remains the asset authority.

The compiled Globe program now prepends a dedicated reference-derived density
library. It retains cube-sphere weather coordinates, four bounded layer lanes,
height-dependent coverage, shape/detail/turbulence sampling and erosion, while
the retained shared library supplies the accepted eight-octave phase-preserving
lighting, atmosphere-derived Sun/sky inputs, local powder, bounded view/Sun
marches, Beer-Lambert integration, MRT publication and resolve. WGS84 ECEF is
projected onto the Bruneton bottom-radius sphere before local ENU offsets are
applied; this prevents ellipsoid radius from becoming false cloud altitude.
Planar compiles without the new Globe library and retains its previous density
body.

The actual-GPU Globe probe independently reconstructs the controlled reference
sample on the CPU and matches density=`0.625`, optical depth, transmittance,
height gradient=`0.75`, solar source, exact `1/(4*pi)` sky source, local powder,
opacity and premultiplied radiance within RGBA16F-aware tolerance. Existing
linear/log complete-attachment, exact clear, replay, occupancy, A2/A3,
failure/resize/context/destroy and resource lifecycle evidence remains green.
Obsolete Globe/Planar numerical-parity assertions were replaced by independent
finite, positive-density, ordered-distance and replay authorities, as required
by the Globe-first boundary; no Planar product formula or calibration changed.

`Test/高级环境.html` exposes a labeled `A4-G Globe owner gate` with stable
ground/inside/above/near-space cameras and atmosphere-only, fog-only,
cloud-only, atmosphere+fog, atmosphere+cloud and fully-combined states. Browser
smoke traversed all ten controls and ended `ready · HDR`. Cloud-only and fully
combined ground captures retained nonuniform bodies/gaps and did not show a
viewport-wide white/gray slab. The distant ground view remains soft and
low-frequency, so visual quality remains an explicit owner-gate risk rather than
an execution approval.

Exact validation: isolated Globe reference probe=`1/1`, retained reference
lighting/mutation probe=`1/1`, radiometric attachment fixture=`1/1`, controller=
`62/62`, A1 private pipeline=`7/7`, CloudCore generator=`10/10`, installed
package/provenance smoke=`23/23`. Focused formatting/lint/docs/diff results are
recorded in the current review. Runtime resource delta is zero: no pass, program,
texture, FBO, history, asset, public API or GPU-byte budget changed. Ownership
audit remains upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008` is
consume-only. Tree remains uncommitted and unpushed; A5-G and owner gate remain
blocked pending Architecture review.

## Architecture review — changes requested 2026-08-27

Independent source, GPU and browser review does not accept the current candidate.
The reference-shaped density equations compile and the focused probe passes, but
the integrated WGS84-to-Bruneton coordinate seam is not reference-correct.
`A4-AR-029` is open in the current review.

The primary and Sun marches currently derive their bottom-sphere anchor from the
normalized WGS84 surface position. The fixed reference instead derives the
altitude correction from the WGS84 geodetic surface normal, so its corrected
surface anchor is `normal * bottomRadius`. At geodetic latitude 45 degrees the two
directions differ by about `0.192423` degrees, or `21,396` metres on the configured
bottom sphere. Although radial cloud height remains close, the Globe weather and
shape phase is displaced by more than two 10-kilometre shape periods.

The cube-sphere face selector also uses strict dominant-axis comparisons, whereas
the fixed reference uses inclusive comparisons with a stable Y-then-X tie order.
For normalized direction `(1,1,0)`, the product branch produces approximately
`(1.11237,-0.20711)` while the reference produces `(0,0.5)`. After repeated weather
sampling this selects unrelated texels at an exact cube-face boundary.

The new actual-GPU reference probe cannot detect either defect: it calls the
density and lighting functions directly at synthetic equatorial position
`(bottomRadius + height,0,0)`. It bypasses WGS84 surface conversion, the primary
and Sun marches, cube-face ties, occupancy and final Cloud MRT composition.

Required bounded repair:

1. Use one shared Globe surface-anchor helper in both primary and Sun marches. It
   must reproduce the fixed reference geodetic-normal altitude correction and
   must not substitute a geocentric normalized surface vector.
2. Reproduce the fixed reference cube-face dominance and tie order, or prove an
   equivalent branch-free mapping. Add deterministic boundary cases for all
   dominant-axis ties and adjacent `+/- epsilon` directions.
3. Add an actual-compiled non-equatorial fixture, including at least 45-degree
   geodetic latitude, that exercises the integrated Cloud MRT. Bind expected rays
   to the live WGS84 surface/ENU frame and prove primary/Sun mapping, linear/log
   replay and accelerated-versus-exhaustive support. A direct helper-only probe is
   not sufficient.
4. Rerun the focused Globe reference fixture, exact controller, A1 regression,
   generator/package provenance checks, focused lint/format/docs/diff checks and
   a fresh Globe-only browser matrix at equatorial and mid-latitude views.
5. Do not modify Planar behavior, public defaults, radiometric equations, assets,
   resource counts, SGP-0008, or enter A5-G.

Architecture independently reran the existing direct probe (`1/1`), controller
scope (`62/62`) and A1 private pipeline (`7/7`); their success confirms the
present tests execute but does not close the missing coordinate authority.
Focused Prettier and Markdownlint passed, and `git diff --check` exited zero with
retained line-ending warnings only. A fresh headless Chromium traversal of
the four A4-G cameras and six component states stayed `ready · HDR`, produced 45
successful Globe frames and no page/render error. It removed the prior full-screen
white failure, while the ground view still appears as a soft low-frequency grey
band that remains for the later project-owner visual gate. The tree stays
uncommitted/unpushed; owner gate, checkpoint and A5-G remain blocked.

## A4-AR-029 execution repair — review-ready 2026-08-27

Execution centralized the fixed-reference Globe bottom-sphere anchor in
`sceneGISGlobeCloudSurfaceAnchor`. Both the primary and Sun marches now derive it
from the normalized WGS84 geodetic surface normal rather than the geocentric
surface-position direction. The cube-sphere selector now uses the reference's
inclusive Y-then-X-then-Z dominance order, including exact face ties. The helper
is declared in the shared material library because the frozen Planar compilation
parses the shared sample-position function; Planar never consumes the Globe
branch, and its compiled output and product controls remain unchanged.

Two actual-compiled GPU authorities close the missing evidence. The cube boundary
fixture covers X/Y/Z dominant-axis ties and adjacent positive/negative epsilon
directions against an independently written reference UV mapping, verifies the
periodic weather edge, and rejects a mutation restoring strict comparisons. The
integrated fixture constructs a live WGS84 surface and ENU frame at longitude 15
degrees and geodetic latitude 45 degrees, then runs the shipping Cloud MRT primary
and Sun marches through linear/log programs. It proves exact accelerated versus
exhaustive attachment bits, finite/ordered active and clear output, and rejects a
mutation restoring geocentric anchoring. The independently derived geocentric
bottom-sphere anchor is more than 20 km from the reference geodetic anchor.

Final-source browser evidence traversed the equatorial and 45-degree locations,
each with ground/inside/above/near-space cameras and all six component states:
`2 locations x 4 cameras x 6 states = 48` successful Globe frames. The fresh tab
remained `ready · HDR` with zero page/render errors. No camera, Sun, scale, tint or
Planar control was changed to hide the retained soft low-frequency grey-band
risk; that remains solely for later owner judgment after Architecture re-review.

Exact validation passed: isolated boundary=`1/1`, integrated mid-latitude=`1/1`,
controller=`64/64`, A1 private pipeline=`7/7`, CloudCore generator=`10/10`, and
installed package/provenance=`23/23`. Focused ESLint, Prettier, Markdownlint and
`git diff --check` are recorded after final writeback in the current review.
Resource/pass/program/texture/FBO/history/API/GPU-byte deltas are zero;
upstream-owned=`0`, generated=`0`, new SGP=`0`, and `SGP-0008` remains
consume-only. The tree remains uncommitted/unpushed; owner gate, checkpoint and
A5-G remain blocked.

## Architecture A4-AR-029 independent re-review — approved for owner Globe visual gate 2026-08-27

Architecture independently closes `A4-AR-029` with no new technical finding.
Source inspection confirms that the primary and Sun marches use the same
geodetic-normal bottom-sphere anchor, the cube-sphere selector uses inclusive
Y-then-X-then-Z dominance, and the optional Globe-library source remains a
private compiled-mutation seam with unchanged runtime callers. The frozen Planar
branch does not consume the new Globe density library or the Globe anchor path.

Independent reruns passed: cube-face boundary fixture=`1/1`, integrated
mid-latitude WGS84 fixture=`1/1`, controller=`64/64`, A1 private pipeline=`7/7`,
CloudCore generator=`10/10`, and installed package/provenance=`23/23`. Focused
ESLint, Prettier, Markdownlint and `git diff --check` also passed after the
Architecture writeback; the diff check retained line-ending warnings only.

The final-source browser matrix independently traversed equator and 45-degree
locations across four cameras and six component states, for `48/48` successful
rows. Globe and the frozen Planar comparison stayed `ready · HDR` in every row,
and browser error logs were empty. Mid-latitude ground cloud-only and combined
captures retain nonuniform cloud bodies and sky gaps without the former
viewport-wide white slab. The distant Globe cloud deck is still visibly soft
and low-frequency; this remains an explicit project-owner visual risk, not a
hidden numerical pass condition.

A4-G is now `approved-for-project-owner-Globe-visual-gate`, not phase-complete.
No owner-gate request or result is inferred from this review. The shared tree
remains uncommitted/unpushed; checkpoint, A5-G and all Planar diagnosis or
calibration remain blocked until the project owner explicitly accepts the Globe
visual gate.

## Project-owner Globe visual gate — No-Go / A4-AR-030 2026-08-27

The project owner rejects the post-`A4-AR-029` Globe appearance. Sunlit clouds
remain too grey to read as white clouds, and distant cloud bodies remain too
soft and low-frequency. `A4-AR-029` stays closed: no new coordinate, cube-face,
depth or finite-output defect is claimed. The new blocking finding is
`A4-AR-030`, covering Globe whiteness and spatial-frequency calibration.

The fixed Cesium reference is not visually neutral evidence. Its cloud shader
applies default `cloudExposure=3`, local ACES, gamma and magenta correction after
raymarching, with `sunIntensity=20`; SceneGIS deliberately cannot copy that
second display transfer. However, its default macro shape period is only about
`2439 m`, whereas the current Globe private periods are `10–30 km`, and its
default mip response is less conservative. This source difference directly
supports the owner's low-frequency observation.

Architecture owns and has completed the bounded reference comparison,
parameter isolation and solution decision in the
[active discussion](../discussions/2026-08-27-a4g-cloud-whiteness-frequency-calibration.md).
Execution is no longer assigned open-ended diagnosis. Its exact implementation
scope is private Globe macro/LOD calibration, the existing public
`cloudRadianceScale` default within its unchanged range and linear semantics,
location-correct A4-G owner-gate lighting, and focused raw/final evidence.
Cloud-local tone mapping, white tint/clamp, hidden scale, new resources,
accepted transport/coordinate changes, Planar diagnosis and A5-G remain
prohibited.

Status returns to `changes-requested`. The tree stays uncommitted/unpushed and
the project-owner gate, checkpoint, A5-G and Planar track remain blocked pending
Execution delivery and independent Architecture re-review.

## Architecture A4-AR-030 solution assignment — 2026-08-27

Architecture reproduced the fixed reference on local port `8100`, isolated
SceneGIS macro scale, footprint LOD, public radiance scale, Sun/sky source and
the real Cesium display path, then restored all temporary source mutations. The
owner-gate `day` input at the 45-degree, longitude-15-degree camera was only
`6.229 degrees` above the local horizon; the existing button labeled `sunset`
was actually a `67.484 degrees` high-Sun frame. This mislabeled evidence explains
the warm low-Sun color but does not erase the independent scale/frequency defect.

The converged product values are private Globe macro scale `0.25`, private Globe
LOD scale `0.5`, and public `cloudRadianceScale` default `48.0` with its current
finite `[0,64]` range and linear raw-MRT semantics. Scale `48` yielded
cloud-only display median/p90 Y `224.84/233.77` and median RGB `230/224/218`;
scale `64` visibly compressed the upper distribution. LOD `0.5` raised the
interior five-pixel high-pass mean by `17.3%` over `1.0`; reference-like `0.35`
added only `3.7%` more and exposed low-Sun ray-aligned banding. The accepted
solar-normalized source equations remain frozen; a temporary reference Sun/sky
mutation was not closer to D65 and did not repair the low-Sun olive result.

Execution must implement only the exact values and evidence contract recorded in
the discussion and ADR-0046 amendment. It must remove the partial Spec's
cloud-local ACES display approximation, use raw GPU interior-frequency metrics,
and obtain final-display evidence from the real Cesium PBR Neutral path. The
A4-G owner gate must add location-aware high-Sun `10:30Z`, sunset `18:30Z` and
night `22:00Z` inputs and report actual local solar elevation. Generic
dual-world controls remain available and Planar remains visually unqualified.

No source component, phase, powder, Beer-Lambert, WGS84/cube mapping, asset,
occupancy, depth/composition, history, resource count or Planar-specific product
behavior is reopened. Execution returns an uncommitted/unpushed review-ready
tree and does not request the owner gate, checkpoint or A5-G.

## A4-AR-030 execution delivery — 2026-08-27

The exact Architecture values are implemented: macro `0.25`, LOD `0.5`, and
public default `48.0`. No accepted source equation or frozen coordinate/resource
boundary changed. The revised compiled-GPU fixture separates cloud-body mask
frequency from three fully-interior luminance-frequency metrics and removes the
invalid local ACES approximation. The existing complete-attachment fixture now
covers scale `0/1/48` in both worlds and both depth variants.

Focused results are `1/1` revised frequency, `1/1` radiometric calibration,
`1/1` cube-face boundary, `1/1` 45-degree WGS84 integration, controller `65/65`,
A1 pipeline `7/7`, CloudCore generator `10/10`, and installed
package/provenance `23/23`. Same-source browser execution covered the required
high-Sun cumulus/mixed matrix plus true sunset/no-moon night. The Test reports
`67.484`, `2.175` and `-20.120 degrees` at `15 degrees E / 45 degrees N`; raw
attachments were finite/bounded, high-Sun raw maximum was `1.34375`, sunset was
warm, night cloud radiance was zero, and a nonconsecutive equatorial capture was
bit-exact for resolved color/distance and exact for the final displayed frame.

State is `review-ready; A4-AR-030 execution awaiting Architecture re-review`.
Owner re-gate, checkpoint, commit/push, A5-G and all Planar diagnosis remain
blocked.

## Architecture A4-AR-030 re-review / A4-AR-031 — 2026-08-27

Architecture accepts the A4-AR-030 product implementation. Independent source
inspection confirmed macro scale `0.25`, Globe LOD `0.5`, public/JSDoc/package
default `48.0`, the absence of the rejected cloud-local ACES approximation, and
the freeze on the accepted source, transport, coordinate and resource boundary.
Architecture independently reran the revised frequency fixture, complete raw
calibration fixture, exact controller, A1 pipeline, CloudCore generator and
installed-package verifier; all passed.

Independent final-source browser evidence also confirms the product result. At
`15 degrees E / 45 degrees N`, high Sun is `67.484 degrees`; the mid-latitude
ground cloud-only raw source was `1.0811/1.0211/0.9579`, finite and bounded, with
display p90 `0.9120` and retained dark cavities. True sunset measured
`2.175 degrees` and remained warm; no-moon night measured `-20.120 degrees` and
raw cloud RGB was exact zero. Browser render errors were zero.

The owner evidence path nevertheless has a new blocking Test-only integrity
finding, `A4-AR-031`:

1. The A4-G four-preset button calls the generic dual-world grid. Its title,
   evidence key and primitive visibility use `currentArtifactMode`, while A4-G
   state is owned independently by `currentGlobeOwnerGateState`. Selecting A4-G
   `Cloud only` therefore leaves the grid labeled `combined`, preserves ordinary
   primitives, and captures Globe and Planar under different component states.
2. `captureGlobeA4GEvidence` reports replay using only an exact final-frame hash.
   Architecture reproduced raw color/distance attachment bit identity while four
   same-state displayed frames alternated between two hashes. The only channel
   delta was one 8-bit LSB over `12,190 / 577,005` pixels (`2.11%`), consistent
   with final-display quantization/dither rather than Cloud MRT instability. A
   single lucky exact hash is therefore not a fail-closed display-stability gate.

Execution must repair only `Test/高级环境.html` and the persistent A4-G records.
The preset grid must become explicitly Globe/A4-G-owned (or be split into a
separate named Globe grid), snapshot and report location/camera/lighting/gate
state, hide only Globe primitives for `a4gCloudOnly`, and neither mutate nor
present Planar as A4-G evidence. Replay must keep raw attachments bit-exact,
report dimensions plus per-channel/pixel display deltas, keep `displayExact`
truthful, and add a fail-closed bounded `displayStable` authority: equal
dimensions, maximum channel delta at most one 8-bit LSB, changed-pixel fraction
at most `0.05`, and p10/median/p90 deltas at most `1/255`. The browser matrix must
prove correct labels/state snapshots and both exact-raw plus bounded-display
replay in high-Sun, sunset and night.

No product JS/GLSL, public default/range, radiometric equation, asset, pass,
program, texture, FBO, history, GPU byte, Planar behavior, owner-gate request,
checkpoint, commit/push or A5-G change is authorized. State is
`changes-requested; A4-AR-031 focused Test evidence repair assigned`.

## A4-AR-031 execution repair — review-ready 2026-08-27

`capturePresetGrid` now has a Globe-only authority. The visible title and
snapshot identify `midLatitude / ground / a4g-highSun / a4gCloudOnly / medium`
and `cumulus -> stratus -> cirrus -> mixed`; only Globe primitives are hidden
during cloud-only capture. The Planar before/after snapshot retained primitive
visibility plus preset and all four environment toggles exactly.

The display comparator now validates both dimensions, counts changed pixels,
reports changed fraction and maximum RGBA byte delta, and compares
p10/median/p90 luminance. `displayStable` fails closed unless dimensions match,
maximum delta is at most one, changed fraction is below `0.05`, and every
percentile delta is at most `1/255`. Resolved color and distance remain
strictly bit-exact. Capture pauses the default loop, reads the actual Cesium
framebuffer inside `postRender`, records 24 controlled renders, and compares
the first and last ordered four-sample groups from an exact attachment phase
that recurs at least eight times; the occurrence count and selected capture
indices remain visible.

Final-source evidence at 15 degrees east / 45 degrees north:

- High Sun `67.484 degrees`, cloud-only: raw source RGB
  `1.06725/1.00793/0.94548`, raw Y p10/median/p90
  `0.90366/1.00634/1.14574`; displayed Y
  `0.40067/0.40067/0.91366`, maximum `0.95686`.
- True sunset `2.175 degrees`, fully combined: raw source RGB
  `0.57202/0.21432/0.04926`, raw Y
  `0.06905/0.25847/0.55249`; displayed Y
  `0.28633/0.39281/0.50898`, maximum `0.96078`.
- No-moon night `-20.120 degrees`, cloud-only: raw source RGB and raw
  p10/median/p90 Y are exact zero.

All three captures had nonfinite pixels=`0`, resolved color/distance exact=
`true`, `displayStable=true`, and zero browser errors. The selected exact
phases recurred `16/20/16` times respectively over 24 renders, so no single
lucky frame is the stability authority.

Only `Test/高级环境.html` and the current A4-G AgentDocs changed for this
finding. Product/resource/pass/program/texture/FBO/history/API/GPU-byte delta=
`0`; upstream-owned=`0`, generated=`0`, new SGP=`0`, and `SGP-0008` remains
consume-only. Owner gate, checkpoint, commit/push and A5-G remain blocked
pending Architecture re-review.

## Architecture A4-AR-031 re-review / A4-AR-032 — 2026-08-27

The Globe-only preset grid repair is accepted. Architecture independently
observed the exact visible owner-state title, four Globe images, hidden Globe
primitives for `a4gCloudOnly`, and identical Planar primitive/preset/four-toggle
state before and after capture. Product and Planar source remain untouched.

The replay repair is rejected because its attachment-phase selection is
fail-open. The 24 controlled renders are grouped by raw color/distance hash; the
largest group is selected, while every unselected frame is labeled
`stateApplicationFrames` even when alternate phases recur throughout the run.
Architecture's fresh high-Sun capture observed alternate raw phases at indices
`0/6/10/13/17/20`, including a third phase at index `20`, while the helper still
reported `resolvedColorExact=true`, `resolvedDistanceExact=true` and
`displayExact=true` for the chosen group.

An independent unscreened run measured one alternate phase against the dominant
phase: `219,392` color half-words and `38,087` distance half-words differed. The
corresponding final display changed `8,368 / 577,005` pixels (`1.450%`) with a
maximum one-byte delta. The display difference satisfies the bounded display
contract, but the raw attachments do not satisfy strict identity. Selecting the
dominant phase therefore converts a real raw failure into a pass. Conversely,
after eight explicit convergence renders, Architecture captured `24/24` frames
with one raw phase and one display hash. This confines the new finding to Test
capture scheduling rather than reopening the product.

`A4-AR-032` requires the following focused Test repair:

1. Remove raw-hash phase grouping and arbitrary frame exclusion. After stopping
   the default loop, drain any pending render-loop task, then capture a bounded
   maximum of `64` controlled frames. Acceptance requires one uninterrupted run
   of at least `16` frames whose color and distance attachments are bit-exact and
   whose displayed output satisfies the existing bounded stability contract.
   Frames before that run may be reported only as one contiguous convergence
   prefix; no frame inside or after the accepted run may be discarded.
2. Compare the first ordered group of four with the last ordered group of four,
   but include every intervening accepted frame in raw-identity and display-
   stability authority. Report convergence-prefix length, accepted indices and
   every accepted hash/delta. Fail closed if no uninterrupted run is found.
3. Make preset-grid behavior use the captured `snapshot.ownerState`, not the live
   mutable global after snapshot creation. Verify owner location, camera,
   lighting, state and quality still equal the snapshot on completion; fail the
   evidence if controls changed mid-capture.
4. Repeat high-Sun cloud-only, true-sunset combined and no-moon-night cloud-only
   evidence plus the Globe-only grid/Planar-isolation check. Focused Test lint,
   formatting, current A4-G Markdownlint and `git diff --check` are sufficient.

No product JS/GLSL, public value/API, asset/resource, Planar behavior, owner-gate
request, checkpoint, commit/push or A5-G work is authorized. State=
`changes-requested; A4-AR-032 contiguous convergence evidence repair assigned`.

## A4-AR-032 execution repair — review-ready 2026-08-27

The Test replay protocol now removes phase grouping entirely. It disables the
default Globe loop, drains two pending RAF boundaries, executes eight explicit
controlled convergence renders, then uses the remainder of a strict 64-render
budget to find a continuous 16-frame run. The candidate begins at the current
frame and resets on any resolved color mismatch, resolved distance mismatch, or
assigned bounded-display mismatch. The reported convergence prefix is exactly
the contiguous range before the accepted run; nothing within or after the run
is discarded.

All 16 accepted frames are compared to the run reference for raw bit identity
and display stability. The first four are additionally paired with the last
four (`0/12`, `1/13`, `2/14`, `3/15`). Evidence exposes prefix length, total
controlled renders, all accepted original indices, every accepted display/color/
distance hash, history stationary/read-index state, and maximum changed-pixel,
channel and percentile deltas. Failure to reach 16 consecutive frames by render
64 leaves every exact/stable result false.

Final same-source results at 15 degrees east / 45 degrees north:

- High Sun `67.484 degrees`, cloud-only: prefix=`22`, total=`38`, accepted=
  `22-37`; raw RGB `1.06725/1.00793/0.94548`, raw Y
  `0.90366/1.00634/1.14574`, displayed Y `0.40067/0.40067/0.91366`.
- True sunset `2.175 degrees`, fully combined: prefix=`8`, total=`24`, accepted=
  `8-23`; raw RGB `0.57202/0.21432/0.04926`, raw Y
  `0.06905/0.25847/0.55249`, displayed Y `0.28633/0.39281/0.50898`.
- No-moon night `-20.120 degrees`, cloud-only: prefix=`10`, total=`26`, accepted=
  `10-25`; raw RGB and raw Y distribution remained exact zero.

Each 16-frame run had one display hash, one resolved-color hash and one
resolved-distance hash; all frames reported stationary history/read index zero.
Maximum changed pixels/fraction/channel/percentile deltas were zero,
`displayExact=true`, `displayStable=true`, and both resolved exact flags were
true. Nonfinite pixels and browser errors were zero.

The accepted Globe-only grid now drives cloud-only primitive visibility from
immutable `snapshot.ownerState`. It re-snapshots owner location, camera,
lighting, state and quality after capture, retains the Planar before/after audit,
and exposes `valid=false` if either authority changes. Final grid evidence had
the exact labeled state, `ownerUnchanged=true`, `planar.unchanged=true`, and
`valid=true`.

Product/resource/API/Planar delta remains zero; upstream-owned=`0`, generated=
`0`, new SGP=`0`, and `SGP-0008` remains consume-only. Owner gate, checkpoint,
commit/push and A5-G remain blocked pending Architecture re-review.

## A4-AR-032 final fail-closed execution — review-ready 2026-08-27

The raw summary is now computed once. Top-level `valid` requires
`globeEffects.enabled` and `ready`, unchanged owner state, raw available and
finite, all three nonfinite counts and all three existing bounds counts equal
zero, and `storageGuardExceeded=false`. The initial disabled/not-ready direct
invocation returned `{ available: false }` and `valid=false`. The only second
invocation, enabled/ready high-Sun cloud-only, retained the accepted raw/display
values with every existing check passing and `valid=true`. Browser errors were
zero. No evidence or product surface beyond this boolean derivation changed.

### Final fail-closed correction

Independent review accepted the one-frame atomic capture when the controller is
enabled and ready. One direct disabled-state invocation returned
`raw.available=false` with top-level `valid=true`. Bind the existing `valid`
result to controller enabled/ready, raw available/finite, zero existing bounds
failures, storage guard false, and owner unchanged. Add no new metric, retry,
frame, hash, replay or test matrix. Focused Test lint/format, changed-document
Markdownlint and diff check remain the complete validation boundary.

## Architecture A4-AR-032 re-review and reduced evidence boundary

The independent high-Sun invocation did not reproduce the reported continuous
run: the helper reached its 64-render ceiling with no accepted frames and two
raw/display phases. Atomic inspection ruled out mismatched read frames or a
still-running Globe loop; low Cloud MRT, resolved output and display moved
together, while the display delta stayed within the already accepted one-LSB
bound. Continuing to require raw bit identity across 16 display frames would
turn a Test diagnostic into a stronger contract than the visible product.

The replacement work is deliberately smaller:

1. Remove convergence/warm-up loops, phase handling, repeated hashes, replay
   pairs and multi-frame exact/stable gates from `captureGlobeA4GEvidence`.
2. For each explicitly selected owner state, perform one controlled render and
   atomically copy the actual final framebuffer plus raw Cloud MRT attachments
   in the same `postRender` callback. Summarize only after those copies exist.
3. Keep finite/bounds/storage checks, solar elevation, raw source and displayed
   p10/median/p90/max evidence, and the accepted immutable Globe-state and
   Planar-isolation audit. Existing focused GPU Specs remain the numerical
   product authority; add no replacement replay gate.
4. Validate only focused Test ESLint/Prettier, current changed-document
   Markdownlint, and `git diff --check`.

Product JS/GLSL, public values/API, resources, Planar behavior, owner-gate
request, checkpoint, commit/push and A5-G remain out of scope. State=
`changes-requested; simplified A4-AR-032 Test evidence repair assigned`.

## A4-AR-032 simplified Test evidence — review-ready 2026-08-27

Following Architecture's atomic diagnosis, the 16-frame raw-exact convergence
gate is withdrawn. `captureGlobeA4GEvidence` now executes one controlled render
for the explicitly selected immutable owner state. In that render's same
`postRender` callback it copies the final RGBA8 framebuffer and both raw Cloud
MRT half-float attachments before resolving. Only after both copies exist does
the caller compute the raw and displayed summaries.

The capture contains no convergence prefix, RAF warm-up, bounded search,
candidate run, phase grouping, attachment/display hash, replay pair, multi-frame
exactness or stability flag. Direct authority is limited to solar elevation,
raw finite/bounds/storage results, raw source RGB and luminance distribution,
displayed luminance and maximum, plus immutable owner-state validity.

Fresh final-source results at 15 degrees east / 45 degrees north:

- High Sun `67.484 degrees`, cloud-only: raw RGB
  `1.06725/1.00793/0.94548`, raw Y `0.90366/1.00634/1.14574`, displayed Y
  `0.40067/0.40067/0.91366`, displayed maximum `0.95686`.
- True sunset `2.175 degrees`, fully combined: raw RGB
  `0.57202/0.21432/0.04926`, raw Y `0.06905/0.25847/0.55249`, displayed Y
  `0.28633/0.39281/0.50898`, displayed maximum `0.96078`.
- No-moon night `-20.120 degrees`, cloud-only: raw RGB, raw maxima and raw
  p10/median/p90 Y were exact zero; displayed maximum was `0.41961`.

All three had finite output, zero nonfinite/bounds failures,
`storageGuardExceeded=false`, immutable owner state, and `valid=true`. Browser
errors were zero. The accepted Globe-only grid retained its exact label, hidden
Globe primitives for cloud-only, four Globe captures, unchanged owner snapshot,
unchanged Planar primitive/preset/four-toggle snapshot and aggregate
`valid=true`.

Product/resource/API/Planar delta remains zero; upstream-owned=`0`, generated=
`0`, new SGP=`0`, and `SGP-0008` remains consume-only. Owner gate, checkpoint,
commit/push and A5-G remain blocked pending Architecture re-review.

## Architecture final A4-AR-032 acceptance

Final-source direct review reproduced exactly the required fail-closed boundary:
disabled/not-ready returned `raw.available=false, valid=false`; enabled/ready
high-Sun cloud-only returned available, finite, bounded, storage-safe raw output
and `valid=true`. Source inspection confirmed raw is summarized once and no
retry, render, wait, hash, replay or substitute gate was added. `A4-AR-032` is
closed. The next gate is project-owner Globe visual judgment; checkpoint,
commit/push, A5-G and Planar work remain blocked.

## Project-owner gate and phase closure

The project owner reported `通过` on the final live Globe result after
Architecture accepted A4-AR-032. The A4-G visual gate is passed and this change
set forms the local unpublished phase checkpoint. A5-G is not activated and
Planar adaptation remains deferred.
