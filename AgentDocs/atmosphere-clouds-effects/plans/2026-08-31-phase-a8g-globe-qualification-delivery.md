# Phase Plan: A8-G Globe Qualification and Delivery

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture approved; owner visual gate passed`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md](2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md)
- Frozen predecessor checkpoint:
  A7-G=`6f70b54c80ce174bf7befe49fe37262230288e61`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-31`
- Updated: `2026-09-02`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [A8-G qualification source discovery](../discussions/2026-08-31-a8g-qualification-source-discovery.md)
- Decisions: inherited `ADR-0040` through `ADR-0049`; `ADR-0046` amended by
  `A8-AR-010`
- Upstream patches: active `SGP-0008` and `SGP-0009`, both audit-only
- Open review findings: `none; A8-AR-001 through A8-AR-034 closed`
- Owner visual gate: `passed 2026-09-02`

## Goal

Qualify and package the accepted A2-A7 Globe advanced-environment stack for
delivery. Produce clear Chinese release samples, deterministic build/package
evidence, a focused local end-to-end smoke, an upgrade checklist and a bounded
project-owner visual matrix without reopening predecessor rendering design.

## Frozen predecessor

- A7-G checkpoint `6f70b54c80ce174bf7befe49fe37262230288e61`
  is immutable.
- A2-A7 product JS/GLSL, public API/defaults/ranges, radiometry, depth authority,
  temporal policy, quality tiers, resource topology, assets and SGP seams are
  frozen.
- A8-G starts with no authorized product runtime edit. A reproduced defect must
  be reported as a focused Architecture finding before changing predecessor
  code.
- Planar product formulas, calibration, visual qualification and parity claims
  remain deferred. Separating the retained Planar Test UI does not activate the
  Planar product track.
- No push is authorized.

## Focused predecessor reopening — A8-AR-010

The project-owner comparison against the fixed local
`three-geospatial@b012ad06` source reproduces a material cloud-quality defect,
not a release-page calibration issue. Globe currently collapses the available
shape/detail channel hierarchy to one channel, represents `cumulus` as one
thick slab, and evaluates a few Sun samples over the complete cloud exit while
the already allocated Beer atlas is absent from cloud-body lighting. This
produces broad low-frequency blocks, weak multi-layer silhouettes and flat
self-shadowing compared with the source-backed reference.

Architecture authorizes one bounded Globe-only correction:

- deterministically import the pinned reference `shape`, `shape_detail`, local
  weather, turbulence and STBN payloads with exact file hashes, provenance and
  MIT notice; Globe selects these five payloads while Planar keeps the existing
  SceneGIS-generated files, so runtime texture/request counts do not increase;
- align low-cloud layer spacing, thickness, macro/detail repeats and density
  scales/profile with the fixed reference while retaining existing public
  `cloudBaseHeight`, `cloudThickness`, `cloudCoverage`, `cloudDensity` and
  preset semantics as global modifiers;
- split Globe Sun transport into a short local detail march plus the remaining
  distance from the existing filtered Beer atlas, avoiding overlap;
- add the reference one-sample ground-bounce topology through existing A2
  irradiance and CloudCore inputs; one internal high-quality turbulence uniform
  may select the reference's quality behavior;
- preserve Planar preprocessor output, A6 history ownership, A5 surface/ray
  consumers, quality-tier sample counts, runtime texture topology, public
  API/defaults, upstream-owned files, generated-module ownership and SGP scope;
- amend existing focused GPU and package fixtures to verify exact imported
  types/hashes, reference density/ground-light equations and finite transport,
  then perform one fixed owner-view comparison after source validation.

A8 qualification and its owner gate remain blocked until this focused product
correction is independently reviewed. The previously accepted A8 findings are
not reopened.

## Deliverables

### 1. Release-facing direct Test pages

Refactor the existing monolithic page into two direct entries. The project
owner explicitly declined a separate navigation hub:

- `Test/高级环境.html`: the Globe-only A2-A8 release sample and observations;
- `Test/高级环境-平面.html`: the retained Planar-only sample, without Globe/A8
  qualification claims;
- reciprocal links provide direct navigation without a third page;
- shared CSS/ESM under `Test/AdvancedEnvironment/` where it genuinely removes
  duplicated lifecycle, presentation or control logic.

Both world pages must import the existing local
`/Test/lib/lil-gui/lil-gui.esm.min.js` and use `lil-gui` consistently. Update
`Test/lib/README.md` usage metadata only; do not modify the vendored bundle.
Use one `/Build/CesiumUnminified/index.js` ESM runtime per page and preserve the
required BFCache-aware, idempotent ownership cleanup.

The release pages retain useful named camera/time/surface/quality presets and
compact live readiness/error/resource status. Do not carry forward historical
finding JSON, hashes, replay/convergence helpers, settling loops, parameter
sweeps or obsolete owner-gate panels. The refactor must not change controller
values or product behavior.

### 2. Bounded Globe visual matrix

Expose one direct A8 observation group on the Globe page with these fixed
representative states:

1. ground, high Sun, fully combined, medium/cumulus;
2. above cloud, high Sun, fully combined, medium/mixed;
3. ground, true sunset, fully combined;
4. ground, no-moon night;
5. near space, high Sun;
6. one explicit `medium -> low -> high` quality observation using the existing
   caller-owned tiers.

The release page reports public ready/HDR state, selected tier, measured solar
elevation and browser/render errors. Finite/storage authority remains in the
focused automated qualification records and is not synchronously polled by the
release sample. The matrix is an interactive manual observation, not a pixel
gate. Public World Imagery/Terrain stays an optional best-effort selector with
the existing offline fallback.

### 3. Resource and performance qualification

Record one consolidated inventory of the already frozen resource ownership:
A4 cloud MRT/history, A5 BSM tier sizes, A6 two-target history and A7 three-FBO
HDR graph. Confirm stable resource identities through one existing lifecycle
authority, viewport resize, quality change, disable and destroy. Use the
existing tier tables and byte formulas; do not add timing readback, automatic
quality changes, FPS thresholds or another GPU metric framework.

### 4. Focused development and release E2E

Add `Specs/e2e/scenegis-globe-environment.spec.js` and run the same focused file
once in development mode and once in release mode. It must use local data and
cover only delivery risks:

- the two release samples expose reciprocal direct links;
- the Globe page starts one controller, reaches `ready · HDR`, renders without
  page/console errors or external requests, and has terrain-depth lifecycle
  ownership active;
- disable/destroy releases SceneGIS-owned resources and restores caller-owned
  state;
- the separated Planar page receives only a navigation/startup smoke. This is
  not a Planar effects qualification or visual assertion.

Do not add screenshot baselines, hashes, retries, warm-up searches, multiple
viewports or an all-browser matrix.

### 5. Build, types, docs and package delivery

Run sequentially on final source:

- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run tsc`
- `npm run build-docs`
- `node scripts/scenegis/verify-planar-packages.mjs`
- `node scripts/scenegis/audit-upstream-patches.mjs`

The installed-package verifier must continue to prove root and engine exports,
types, API docs, private-runtime hiding, shader modules and exact deterministic
assets. Do not rename or duplicate the verifier solely because its historical
filename mentions Planar; amend it only if a concrete A8 delivery gap is
reproduced.

### 6. Upgrade checklist

Create `Documentation/SceneGIS/GlobeEnvironmentUpgradeChecklist.md` covering:

- Cesium baseline and build/type/package entry points;
- `SGP-0008` and `SGP-0009` markers, paths and focused tests;
- generated-file boundaries;
- deterministic LUT/cloud assets and provenance checks;
- public exports/types/API docs/private hiding;
- frozen resource/tier budgets;
- focused dev/release E2E and manual Globe matrix;
- checkpoint/rollback expectations.

This is an operational checklist, not a new architecture authority. No new ADR
is required unless implementation changes a long-lived contract.

## Expected changed paths

- `Test/高级环境.html`
- `Test/高级环境-平面.html`
- `Test/AdvancedEnvironment/**`
- `Test/lib/README.md`
- `Specs/e2e/scenegis-globe-environment.spec.js`
- `Documentation/SceneGIS/GlobeEnvironmentUpgradeChecklist.md`
- current A8-G `AgentDocs/**` records

No `packages/engine/Source/**`, Shader, public API, upstream-owned, generated or
asset path is expected to change. If a concrete qualification failure requires
one, Execution stops and returns the finding before editing.

## Minimal sufficient validation

Run sequentially; shared `Build/**` output must not be mutated concurrently.

1. Existing focused Specs:
   - `SceneGIS/Scene/SceneGISEnvironmentEffects`
   - `SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline`
   - `SceneGIS/Scene/_private/SceneGISAtmosphereReferenceFrame`
   - `SceneGIS/Scene/SceneGISAdvancedEnvironmentRenderSlot`
   - `Scene/GlobeSurfaceTileProvider`
2. The six build/type/docs/package/audit commands listed above.
3. `npm run test-e2e -- Specs/e2e/scenegis-globe-environment.spec.js`.
4. `npm run test-e2e-release -- Specs/e2e/scenegis-globe-environment.spec.js`.
5. Focused ESLint/Prettier/Markdownlint and `git diff --check` for changed
   scope.
6. One direct project-owner pass through the six fixed Globe observations.

Do not run full Jasmine, full E2E, all browsers, repeated build matrices, FPS
gates, replay/hash comparisons or extra generator tests once these direct
authorities pass.

## Acceptance criteria

- Development and release builds, types, API docs and installed packages expose
  the same accepted public Globe API and load all deterministic assets.
- The focused dev/release E2E is local, deterministic and free of page/console
  errors, with exact lifecycle cleanup.
- Resource counts, byte formulas, quality tiers and SGP path sets match the
  frozen A4-A7 contracts without growth.
- The two release Test entries are clear, use local `lil-gui`, avoid historical
  evidence clutter and retain correct ownership cleanup.
- The project owner accepts the bounded Globe visual matrix.
- Architecture review has no open finding and creates the isolated local A8-G
  checkpoint. Only then may Architecture source-discover the Planar track.

## Stop conditions

Stop and return to Architecture if qualification reveals a product/rendering
defect, requires an upstream/generated path edit, changes a public/runtime
contract, grows resource topology, makes a network dependency mandatory or
would activate Planar product calibration. Do not work around such a finding in
Test, E2E, package scripts or documentation.

## Execution evidence — 2026-08-31

- The direct-entry deviation is implemented exactly as accepted by Architecture:
  `Test/高级环境.html` is the Globe release sample,
  `Test/高级环境-平面.html` is the retained Planar sample, and no
  `Test/高级环境-球面.html` or navigation hub exists. Both pages use the local
  `lil-gui 0.21.0`, one Cesium ESM runtime and idempotent BFCache-aware cleanup.
- The Globe direct inspection reached `ready · HDR · medium · terrain depth
owned` at the fixed high-Sun ground state, measured solar elevation
  `67.484°` and zero current browser/render errors. The retained Planar page reached
  `ready · HDR · retained Planar · medium/cumulus` with zero current errors; no
  Planar qualification claim is made.
- Focused Specs pass: controller `77/77`, A1 private pipeline `7/7`, atmosphere
  reference frame `4/4`, advanced render slot `5/5`, and
  `GlobeSurfaceTileProvider` `57/57`.
- `npm run build`, `npm run build-release`, `npm run build-ts`, `npm run tsc`,
  `npm run build-docs`, installed delivery `26/26`, and the upstream patch audit
  all exit `0`. `A8-AR-001` changes only the existing SGP-0009 structural JSDoc
  cast in `GlobeSurfaceShaderSet.js`; runtime tokens are unchanged and both the
  real JSDoc parser and TypeScript accept
  `Partial.<{_sceneGISGlobeLighting: Partial.<{active: boolean}>}>`.
- Focused development E2E passes `1/1` with retries disabled, local requests
  only, exact Globe enable/disable/destroy terrain-depth ownership and retained
  Planar startup/navigation. The same focused release configuration passes
  `1/1` through PowerShell-scoped `release=true`; the repository's existing
  POSIX-style `test-e2e-release` npm wrapper itself cannot start under Windows
  `cmd.exe`. The new Spec clears the repository-wide forced
  `--use-angle=gl` launch argument because that backend cannot construct WebGL
  in current headless Chromium; default Chromium WebGL reaches ready/HDR.
- A8 adds no product pass, program, texture, FBO, history, GPU byte, public API,
  static asset or runtime dependency. Upstream-owned current-delivery delta is
  the one already registered SGP-0009 path; generated status is `0`, no new SGP
  is introduced, and SGP-0008 remains consume-only.

## A8-AR-002/003/004 execution correction — 2026-08-31

- The same focused E2E now additionally uses the existing `cesiumPage` fixture
  and `Specs/e2e/cesium.html` to load the actual public bundle selected by
  `process.env.release`. It creates one offline Globe Viewer and public
  `SceneGISEnvironmentEffects`, validates ready/HDR plus public controller and
  terrain-depth acquire/disable/re-enable/remove/destroy behavior, and never
  inspects private renderer state.
- The Globe release sample no longer decodes half floats, reads Cloud MRT,
  constructs temporary framebuffers or exposes `_pipeline`, `_resources` or
  `_ownsGlobeDepthTestLifecycle`. Its card is limited to public ready/HDR,
  controller settings, terrain-depth state, tier/Sun observation and errors.
- The quality observation is now owner-paced: each click advances exactly one
  step `medium -> low -> high -> medium`, updates the visible observation and
  `lil-gui`, and performs no `postRender` automation, wait or settling frame.
- Finite/storage and frozen resource authority remains in the already accepted
  focused Specs, installed-delivery checks and upgrade checklist rather than the
  release UI.
- Final focused development E2E and PowerShell-scoped release E2E each pass
  `1/1`. Both execute the direct-page smoke and the public-bundle lifecycle;
  release mode is selected only by the existing `cesiumPage` fixture.
- One direct smoke reached Globe ready/HDR with zero errors; three owner clicks
  left the visible tier at `low`, `high`, then `medium`. The retained Planar
  entry reached ready/HDR with zero errors and retained its deferred label.

## Project-owner delivery-page correction — 2026-08-31

- The Globe `Viewer` now creates Cesium's native default `BaseLayerPicker` and
  `Timeline`. The provider arrays come directly from Cesium's two default
  factory functions, so the complete Cesium imagery/terrain directory and
  original categories are retained. The built-in Natural Earth II and WGS84
  Ellipsoid entries are selected initially to preserve offline startup.
- The custom `lil-gui` “Globe 表面” controller, `surfaceMode` state and manual
  provider mutation path are removed. `lil-gui` remains the effect-control
  surface and is offset so the native picker and timeline stay usable.
- The fixed-observation day is exposed through the public `Clock` and
  `Timeline` range for `2026-06-21`. The Planar sample and all product paths are
  unchanged.
- Final Basic observation: `ready · HDR · high · terrain depth owned`, errors
  `0`; one fast drag rotation left no persistent captured screen-space shadow
  trail. Residual softness/block structure remains owner-visible risk.
- The existing focused E2E passes `1/1`, directly asserts both native controls,
  absence of the duplicate surface controller and `SceneGIS` category, and the
  existing public lifecycle. Focused ESLint and Prettier pass. No build,
  package, GPU or broader matrix was rerun.

## A8-AR-006 execution correction — 2026-08-31

- Reproduction isolated a shared product defect rather than a Test camera
  transition: the first post-change frame had no current frustum commands while
  the resolved depth texture still contained prior-frame values, and far-field
  DEM LOD height changes caused discontinuous atmosphere endpoints.
- `_executeHdr` now publishes current-frame Globe depth availability. Existing
  Globe depth consumers fail to clear-depth semantics for that frame; there is
  no delay, retry, warm-up or settling-frame behavior.
- Finite Globe aerial perspective and exponential height fog share a bounded
  terrain endpoint stabilizer. It preserves exact near depth, then smoothly
  transitions the atmosphere-only endpoint to the Bruneton bottom sphere over
  `8-50 km` ray distance or `2-27 km` camera height. Cloud selection and
  occlusion continue to use exact scene depth.
- The amended existing GPU fixture proves exact near-depth retention,
  far-field LOD-height invariance, high-camera authority and stale-depth versus
  clear-depth identity when no current frustum exists. The existing production
  Globe fog stack fixture also passes.
- One fixed rapid `ground -> near-space` browser observation shows continuous
  output with aerial-only and fog-only. No camera timing workaround or new
  visual gate was added. Product resources, public API, upstream paths, SGP,
  generated outputs and Planar behavior are unchanged.

## A8-AR-007 execution correction — 2026-08-31

- Globe Beer shadow cascades now derive one square orthographic extent from the
  rotation-invariant bounding radius of each practical frustum slice. The
  Sun-space center remains texel snapped, so camera rotation cannot change the
  cascade texel scale or producer density footprint.
- Surface reception now uses a fixed `16`-tap Vogel disk over the existing atlas
  and averages reconstructed Beer transmittance. Per-tap tile clamping,
  transmittance-domain cascade overlap and the unfiltered raw shadow-length path
  remain unchanged.
- The amended Beer-filter GPU fixture and existing shadow lifecycle fixture each
  pass `1/1`. The lifecycle fixture rotates one fixed Globe camera by `90°` and
  directly proves equal square half-sizes before and after rotation.
- One direct browser rotation retained the exact camera position and observed
  invariant cascade half-sizes of approximately
  `29.05/50.22/155.54 km`. No large rectangular shadow lattice was visible.
  A remaining vertical color boundary also occurs with shadows disabled and is
  outside this shadow correction.
- Resource topology, atlas resolution/bytes, quality tiers, public API,
  upstream-owned files, generated status, SGP scope and Planar behavior are
  unchanged. The selected-cascade receiver sampling cost increases from `9` to
  `16` atlas reads; owner visual judgment and interactive performance remain the
  residual checks.

## A8-AR-008 execution correction — 2026-08-31

- The A8-AR-007 square cascade and Vogel receiver remain intact, but the
  producer/receiver material authority is no longer camera-relative. This is a
  coordinate correction, not another resolution or filtering adjustment.
- Following the audited reference structure, the shadow light ray/right/up
  basis is constructed in ECEF against a fixed world axis and only then
  transformed into the current local precision frame. Moving the camera across
  Globe reference frames therefore cannot rotate the atlas basis.
- Globe primary density, occupancy, local Sun optical depth and Beer-atlas
  density reconstruct the same stable spherical material position from the
  actual ECEF sample plus WGS84 geodetic normal/height. The cloud-time offset is
  applied along geographic axes at that sample rather than the camera-footpoint
  ENU axes.
- Globe occupancy now uses `sceneGISGlobeCloudLayerScales`, matching its density
  lookup; its prior Planar morphology scale mismatch is removed. Planar remains
  inside its unchanged preprocessor branch.
- The existing lifecycle Spec proves the ECEF light basis is invariant across
  a `5°` camera longitude move. The existing integrated mid-latitude GPU Spec
  rejects the former camera-relative material mapping, the actual Beer-atlas
  producer passes, and the combined Globe/frozen-Planar material Spec passes.
- One direct current-page drag showed no abrupt camera-locked shadow-field
  rearrangement. No extra temporal pass, atlas allocation, API, resource,
  upstream path, generated output or SGP was added; final visual judgment
  remains with the project owner.

## A8-AR-009 execution correction — 2026-08-31

- Globe now uses the audited Cesium port's `11-51 km` cloud-layer entry fade
  directly. The legacy `60-100 km` per-sample visibility remains only in the
  frozen Planar preprocessor path, so Globe no longer compounds two unrelated
  distance fades.
- A rebuilt-bundle haze-off control removed the reported dark horizon strip and
  identified cloud-local haze composition as the remaining defect. The helper
  already returns integrated in-scatter and opacity; Aerial had both
  double-weighted that radiance through `mix` and omitted the Globe atmospheric
  source-domain scale.
- Globe Aerial now evaluates
  `scene * (1 - opacity) + integratedHaze * background * aerial`. The existing
  GPU fixture rejects both the former double-weighted expression and an
  unscaled mutation, and proves exact `10x` source-domain linearity. The
  integrated Globe cloud fixture proves the reference entry fade and rejects
  its removal.
- One rebuilt direct Globe page retained haze and showed no dark horizon band;
  the live status reported zero browser/render errors. No API, allocation,
  pass, command, upstream-owned, generated, SGP or Planar change was introduced.

## Project-owner ion global buildings control — 2026-08-31

- The Globe `lil-gui` adds one explicit online-data action using the current
  Cesium export `createOsmBuildingsAsync`; no asset ID, token or private
  endpoint is embedded in the example.
- Initial startup still selects local Natural Earth II/WGS84 and performs no
  external request. Loading failure is visible and does not replace the local
  scene. The Globe stays visible because OSM Buildings does not include its own
  terrain.
- A successful load snapshots the caller's camera, named observation and
  status location, then selects the official Cesium New York OSM Buildings
  view. Removal restores every snapshot. Cancel, stale completion and page
  destruction destroy the owned candidate exactly once.
- One online click displayed the New York buildings with zero errors; one
  removal restored the original Globe state. The amended delivery E2E passes
  `1/1` while blocking all external requests, proving the button is present
  without changing deterministic startup.
- This is a `Test/**` delivery-sample addition only. Product, API, renderer,
  GPU resources, upstream-owned files, generated output, SGP and Planar remain
  unchanged.

## A8-AR-010 execution evidence — 2026-08-31

- `scripts/scenegis/import-three-geospatial-cloud-assets.mjs` deterministically
  imports and verifies five pinned Globe payloads totaling `4,292,608` bytes.
  Globe mode selects them in place of the five Planar cloud payloads; request
  and runtime texture counts stay unchanged.
- The fixed reference topology is implemented in the Globe preprocessor path:
  overlapping low/high layers, direct R8 shape/detail, RGBA8 weather and 2D
  turbulence, STBN, short local Sun detail, non-overlapping Beer remainder and
  one ground-bounce sample. Planar retains its prior asset and shader path.
- The reference low-cloud density weight is normalized by `0.2` before the
  existing `cloudDensity` per-meter extinction is applied. This is required to
  keep the public physical coefficient authoritative rather than multiplying
  two scattering-coefficient domains.
- Focused reference GPU fixtures pass. The aggregate controller run produced
  76 green product checks and one test-only binary16 linearity tolerance miss;
  after changing only `0.025 -> 0.03`, that exact fixture passes `1/1`.
  The private pipeline passes `7/7`.
- Both official `gulp build` outputs were refreshed. The sequential installed
  delivery verifier passes `26/26` GLSL and `26/26` generated modules plus exact
  Globe payload hashes, provenance and license in engine/root packages.
- One final default `medium/cumulus`, high-Sun Globe observation displays a
  structured cloud field and reports zero browser/render warnings or errors.
  No owner acceptance is inferred.
- Correction ownership delta: upstream-owned `0`, generated tracked files `0`,
  new SGP `0`. Runtime pass/program/command/texture/FBO/history/readback counts,
  public API/defaults/ranges and Planar behavior are unchanged.

## A8-AR-011 execution correction — 2026-08-31

- The remaining reference mismatch was traced to integration, not missing
  payloads. Globe clamps each authored layer independently and now retains the
  sum across overlapping low layers; the former total-density clamp is removed.
- Globe flattens the existing low `32x1` and medium/high `64x4` quality budgets
  into progressive primary schedules. Minimum steps are `100 m` for low and
  `50 m` otherwise, grow by `1.01`, cap at `1000 m`, and retain the existing
  `100/200 km` low/other ray bounds. The conservative occupancy hierarchy must
  cover the complete proposed empty interval before a long advance. No tier or
  public quality-table value changed.
- Globe texture LOD now uses projected pixel footprint only. The integration
  step remains Beer-Lambert path length and cannot independently force a lower
  shape/detail mip. Planar retains its frozen nested uniform march and
  step-aware footprint formula.
- The amended actual-GPU evidence proves summed overlap above `1`, rejects the
  former total clamp, observes a real reference-texture delta under deterministic
  long-step LOD coupling, and proves at least one Globe ray exceeds the former
  `64`-interval ceiling while all modes remain within their bounds.
- The aggregate controller run reached `75/76`; its sole miss was the old exact
  RGB equality in the occupancy/exhaustive mutation. The schedule-aligned
  exhaustive path had exact distance, validity and transmittance and one RGB
  channel one binary16 ULP apart. The corrected focused fixture accepts that
  storage rounding and passes `1/1`; the material, texture and schedule focused
  fixtures also pass.
- Direct default/high Globe observations remained finite with zero browser
  warnings or errors and no new horizon slab. Final cloud appearance remains
  project-owner authority. Resource/API/upstream/generated/SGP deltas are zero,
  and Planar product output is unchanged.

## A8-AR-012/013 execution correction — 2026-09-01

- Supersede the interim `256`-interval Globe adaptation with the pinned
  reference budgets: low `200`, medium/high `500`; retain finite progressive
  steps, low/other `100/200 km` bounds and the existing occupancy proof.
- Render Globe medium/high at the input depth resolution. Keep Planar quality
  scales and product output frozen.
- Remove the Globe-only post-integration entry fade and old visible-range cap;
  neither may hide authored reference material. Keep the frozen Planar fade.
- Adopt explicit mode defaults derived from the final composed observation:
  Globe `high / 0.3 / 0.005 / background 4`; Planar retains
  `medium / 0.45 / 0.001 / background 10`.
- Reconstruct receiver distance with the exact Globe top-shell intersection
  used by the BSM producer and include the encoded bounded tail OD. Preserve
  fixed ECEF basis, stable square cascades and transmittance-domain overlap.
- Minimum evidence is the amended reference-texture GPU fixture, the Beer/tile
  GPU fixture with an independent sphere equation, the tier lifecycle fixture,
  bounded all-preset sampling, installed delivery, one rebuilt default page and
  one project-owner interactive rotation review. Do not add replay, hash or
  convergence gates.
- No upstream-owned path, generated source, new SGP, public range, renderer
  resource category or Planar behavior may change.
- Final execution evidence: controller aggregate `76/76`, installed delivery
  `26/26` GLSL and `26/26` generated modules, zero direct browser/render errors.

## A8-AR-014 execution correction — 2026-09-01

- Treat the local `three-geospatial` checkout as the exclusive material,
  scheduling and shadow-sampling reference for this finding.
- Match its Globe layer bases `750 / 1000 / 7500 m` and thicknesses
  `650 / 1200 / 500 m`. Change only the Globe default base to `750 m`; retain
  the Planar default `1500 m` and all explicit option overrides.
- Generate Globe weather mips and select them from projected pixel footprint.
  Prove a deterministic level-zero mutation differs on the actual GPU.
- Advance Globe STBN by render frame and use the existing A6 history for exact
  stationary frames; add no history resource. Planar retains its prior clock
  and history policy.
- Construct the BSM sample lattice with the reference structured-volume
  method. Keep cascade axes and texel phase in fixed ECEF light space with
  square extents so camera motion cannot translate the world shadow grid.
- Preserve the existing six-texture/eight-request topology. The weather mip
  chain changes exact Globe cloud bytes to `7,364,997` (`+349,525`) and is the
  only resource-byte delta. No new pass, program, command, FBO, attachment,
  public range, upstream file, generated tracked source, SGP or Planar behavior
  is authorized.
- Minimum evidence is the amended lifecycle, reference-texture, history,
  cloud-core and Beer-atlas fixtures, sequential installed delivery verification
  and one fixed browser recheck. Owner interaction remains the final authority
  for high-altitude shimmer, cloud thickness and terrain-locked shadows.
- Final execution evidence is controller `77/77`, private pipeline `7/7`,
  installed delivery `26/26` GLSL and `26/26` generated modules, and zero
  fixed-observation browser/render errors. The controlled GPU fixtures make
  their historical `1500-6000 m` experimental shell explicit so the product's
  new `750 m` Globe default cannot silently alter their geometry.

## A8-AR-015 Architecture assignment — 2026-09-01

- Record `A8-AR-014` as owner-rejected. Only its layer-height correction was
  visibly effective; its cloud-shape/interior-lighting and world-shadow claims
  are not accepted.
- Use only the local `three-geospatial` sources as the reference:
  `clouds.glsl`, `CascadedShadowMaps.ts`, `shadow.frag` and `ShadowPass.ts`.
  Do not replace source parity with another visual parameter sweep.
- Restore the exact Globe material coefficient domain. The reference default
  low-layer coefficient is `0.2`; the current normalized layer plus
  `cloudDensity=0.005` is a forty-times weaker extinction contract. Change the
  Globe default/range and documentation explicitly, or prove an exact unit
  conversion in the production shader. Do not compensate through
  `cloudRadianceScale` or `backgroundRadianceScale`. Planar remains unchanged.
- Share one exact Globe material helper between visible-cloud and BSM paths:
  layer density algebra, weather/shape/detail mip gate, density/scattering/
  extinction, and actual ECEF sample position must agree. Restore the reference
  progressive secondary Sun and ground schedules and the same source-domain
  Beer integration. Remove superseded normalization/LOD approximations rather
  than retaining parallel authorities.
- Replace the camera-footpoint two-dimensional shadow authority with full
  world/ECEF light view/projection and inverse matrices. Producer rays must be
  reconstructed from the inverse matrix; receivers must project the same ECEF
  point with the matching forward matrix. Select cascades by view-space depth
  and intersect one camera-independent global ECEF cloud-shell authority that
  preserves SceneGIS ellipsoid/radial altitude semantics, not a camera-moving
  osculating sphere. Visible and BSM material LOD must address the same field.
- Add reference-style BSM temporal reprojection/history only after the spatial
  world invariant passes. If added, document exact programs, commands,
  textures, FBOs, history bytes, resize/failure/disconnect lifecycle and
  package boundaries. Temporal filtering may not be used to mask projection
  drift.
- Amend existing actual-GPU fixtures rather than adding a proxy matrix. The
  material fixture must compare controlled production outputs with the exact
  reference equations for weather/layer density, extinction, short-Sun optical
  depth and one integrated step; deterministic restoration of the current
  `0.005` normalization and custom secondary schedule must fail.
- The shadow fixture must hold Sun, cloud time and one ECEF terrain receiver
  fixed while rotating/orbiting the camera. It must prove view-depth cascade
  selection, forward/inverse matrix agreement, producer ray identity, receiver
  UV and sampled OD within declared texel/half-float tolerances. Mutations back
  to Euclidean selection, the local osculating shell or the two-dimensional
  matrix must fail. If BSM history is added, prove the second-frame publication
  and lifecycle separately.
- After automated closure, compare exactly one fixed Globe observation against
  the reference Basic story (`high`, coverage `0.3`, all reference layers,
  `300 m` camera and matched Sun/atmosphere/display state). No retry, settling
  frame, screenshot hash, convergence gate or parameter search is authorized.
- Preserve the dirty shared tree. Do not commit, push, checkpoint, request an
  owner gate, enter A9/Planar work or edit generated shader modules manually.
  Update ADR-0046/0047/0048 only for the final accepted contracts and report all
  upstream-owned paths plus SGP status.
- A standalone “advanced features” navigation/entry page is not part of the
  product delivery and carries no compatibility obligation. If a retained
  legacy copy exists, it may be deleted in a later bounded cleanup. Do not
  modify it in `A8-AR-015` unless the assigned product correction actually
  requires that path.

## A8-AR-015 Execution result — 2026-09-01

- Implemented one shared reference-domain Globe material helper with default
  density multiplier `1.0`, exact authored layer coefficients, material
  mip/jitter detail gate, `50 + 100 m` Sun integration and `0/1/3` ground
  schedule. Planar is unchanged.
- Replaced the camera-footpoint/two-row BSM authority with full forward/inverse
  ECEF matrices, inverse producer-ray reconstruction, view-depth cascade
  selection and the same global spherical material position at producer and
  receiver. No BSM history or GPU resource was added.
- The amended material GPU fixture rejects the normalized `0.005`-era and
  custom secondary-schedule mutations. The amended shadow fixture rejects
  Euclidean cascade selection, local-shell input and two-dimensional matrices,
  while retaining fixed-receiver sampling across rotation/orbit within the
  declared `0.15` Beer-atlas spatial/half-float tolerance.
- Validation: controller `77/77`, A1 `7/7`, installed delivery `26/26` GLSL and
  `26/26` generated modules. The single reference-Basic browser observation is
  ready/HDR with errors `0`; owner-visible highlight exposure and residual
  low-frequency shadow structure remain for Architecture/owner judgment.

## A8-AR-016/017 Architecture correction assignment — 2026-09-01

`A8-AR-015` is changes-requested. Retain its exact authored density domain and
full forward/inverse ECEF spatial mapping, but do not request an owner gate from
the current candidate.

### A8-AR-016 — projected material footprint and physical source domain

- Use the local `three-geospatial` checkout as the exclusive reference. At the
  actual Globe cloud-shell entry, compute the reference projected weather
  footprint equivalent to
  `getMipLevel(globeUv * localWeatherRepeat) * mipLevelScale`, including its
  camera-height blend. Pass `pow(2, mipLevel)` as the ray-start texel footprint
  and evaluate each sample with
  `log2(max(1, rayStartTexelsPerPixel + rayDistance * 1e-5))`.
- The derivative is taken before divergent marching. Do not substitute
  absolute camera distance, integration step length, a fixed LOD or a visual
  bias. Visible-cloud and BSM material sampling must consume a documented,
  coordinate-consistent footprint policy; Planar remains unchanged.
- Port the reference Globe Sun/sky source at the actual cloud point using
  `GetSunAndSkyScalarIrradiance`, and the ground source using the corresponding
  ground point, surface normal and `GetSunAndSkyIrradiance`. Preserve the
  reference phase, multiple-scattering, sky-gradient, ground-bounce and Beer
  ordering. Remove the parallel normalized-transmittance/approximate-ground
  source authority from the Globe branch.
- Map physical cloud radiance into the established Cesium scene-linear A2
  domain exactly once. Derive that mapping from the existing physical
  background contract rather than retaining an unexplained historical `48` or
  tuning a screenshot. If the Globe public default changes, keep the Planar
  default and explicit override semantics frozen and update JSDoc, Specs,
  installed-package expectations and ADR-0046.
- Amend the existing production GPU material fixture. It must compare the
  cloud-entry footprint, one Sun/sky source, one ground source and one
  integrated Beer step against independently evaluated reference equations.
  Deterministic mutations restoring distance-only LOD and the normalized old
  source must fail. Include one bounded high-altitude motion case; do not add a
  parameter sweep, image hash or test-only product path.

### A8-AR-017 — BSM temporal and cascade stability

- Keep the corrected full ECEF forward/inverse cascade mapping. Add the
  reference `ShadowPass` temporal topology after it: current Beer-atlas output,
  depth/velocity publication, reprojected history, closest-depth selection,
  bounded 3x3 variance clipping, fixed temporal alpha and ping-pong history.
  The temporal pass stabilizes the correct world projection; it may not hide a
  fallback to a camera-relative mapping.
- Re-audit the current synthetic 5% cross-cascade blend. Use one view-depth
  selected cascade as the reference does, or construct and document genuine
  geometric overlap in both producer coverage and receiver intervals. Sampling
  the next non-overlapping cascade before its near plane is not accepted.
- Lifecycle must be candidate-first and fail-closed on initial allocation,
  resize and program creation. Declare exact program, command, texture, FBO,
  attachment, history and GPU-byte deltas, plus disable/re-enable/disconnect
  behavior. Public API, A2-A7, upstream seams, generated sources and Planar are
  frozen unless an unavoidable boundary is raised to Architecture first.
- Amend the existing BSM actual-GPU fixture with a fixed Sun, cloud time and
  ECEF receiver across a substantial heading/orbit change that crosses history
  texels. Assert the same world receiver projection and OD using texel and
  binary16-derived tolerances, not the former broad `0.15` proxy. Faithful
  mutations must restore the actual prior Euclidean/local/2D authority and a
  same-frame non-temporal atlas. Prove second-frame publication, camera-cut
  invalidation, cascade transition behavior and full resource release.

After both automated corrections close, run exactly one matched `high`,
coverage `0.3`, all-layer, `300 m` Globe observation against the local Basic
story and one interactive fixed-world shadow rotation observation. Record the
facts without inferring acceptance. Preserve the shared dirty tree; do not edit
the standalone advanced-features navigation page, commit, push, checkpoint,
request an owner gate, enter `A9-G`, or change Planar.

## A8-AR-016/017 execution result — 2026-09-01

- `A8-AR-016`: the Globe march derives entry footprint from the actual cube
  weather coordinates and screen derivatives, applies the reference `0.35`
  response and camera-height blend, and carries that footprint through the
  distance LOD. Globe incident and ground sources now execute physical A2
  irradiance equations at their actual positions. The single mapping into the
  background scene-linear domain is `cloudRadianceScale`, whose mode default
  is `1` for Globe and remains `48` for Planar.
- `A8-AR-017`: the existing BSM gains one current depth/velocity attachment and
  two resolved Beer history targets. The resolve uses closest depth,
  reprojected velocity, current 3x3 Beer mean/variance clipping and temporal
  alpha `0.01`. One selected view-depth cascade replaces the former synthetic
  5% blend. Camera/Sun/cloud continuity is preallocated and fail-closed.
- Resource delta is exactly `+1` program, `+1` command, `+3` textures, `+2`
  FBOs, `+3` attachments and `+2` history textures. Added bytes are
  `6,291,456 / 25,165,824 / 56,623,104` for low/medium/high; total four-texture
  BSM storage is `8,388,608 / 33,554,432 / 75,497,472`.
- Actual-GPU reference, radiometric, BSM producer/resolve and single-cascade
  fixtures pass. Final focused results are controller `77/77`, A1 `7/7` and
  installed delivery `26/26`. The matched Basic observation is ready/HDR with
  no render error; interactive rotation showed no obvious screen-space trail,
  while the soft/low-contrast shadow field remains an owner-visible risk.

## A8-AR-018/019 Architecture correction assignment — 2026-09-01

Retain the accepted physical irradiance functions, Globe-relative
`cloudRadianceScale=1`, full ECEF matrices and declared BSM resource topology.
Do not request an owner gate from the current candidate.

### A8-AR-018 — exact reference-mode entry footprint

- Remove the unexplained `SCENEGIS_GLOBE_CLOUD_MIP_LEVEL_SCALE=0.35`. The local
  Basic story uses the reference temporal-upscale path, which sets
  `mipLevelScale=0.25`; its non-temporal path sets `1`. Match the actual
  comparison state exactly. If SceneGIS sampling topology requires a unit
  conversion, derive it from target/source pixel footprints and record the
  equation; another visual constant is not accepted.
- Exercise the real production `SceneGISEnvironmentEffectsCloudFS` call into
  the real march. The expected authority must come from the local reference
  equation or an independent CPU evaluation, not by copying the product
  constant into a helper-only probe. A deterministic mutation restoring
  `rayStartTexelsPerPixel=1` must change the production output under the fixed
  high-altitude witness.
- Keep the accepted physical Sun/sky/ground equations, source ordering, public
  mode defaults, Planar output and resource topology frozen unless this exact
  test exposes a specific defect.

### A8-AR-019 — complete reference BSM temporal stability

- Advance BSM STBN with rendered frame as the reference `getSTBN` does. Prove
  that two stationary current frames use different valid samples while the
  resolved history remains bounded and converges instead of preserving one
  blocky slice.
- Do not globally discard correct ECEF reprojection merely because camera
  direction/up crosses the shared A6 `10 degree` threshold. Use matrix/UV
  validity for per-pixel rejection through the assigned substantial rotation;
  retain fail-closed reset for incompatible projection, Sun, material, quality,
  frustum or genuine camera cuts. Snapshot or explicitly invalidate every BSM
  material input: preset, coverage, density, base/thickness, detail policy and
  ellipsoid/base-height authority. Cloud advection remains explicitly
  reprojected by previous/current offset.
- Clamp linear history lookup to the selected atlas tile's half-texel centers.
  Add a controlled adjacent-cascade color/Beer sentinel so an edge velocity
  cannot sample another tile.
- Replace the hard cascade edge with the reference faded-overlap selection, or
  construct matching producer/receiver overlap and a transmittance-domain
  transition. In either case, select only producer-covered data and prove no
  discontinuity while a fixed receiver crosses the cascade boundary.
- Amend the existing BSM GPU fixture: keep Sun, cloud time/material and one ECEF
  terrain receiver fixed across a meaningful rotation/orbit that crosses atlas
  texels and, separately, a cascade transition. Assert projected world
  position and resolved OD with texel/binary16-derived bounds. A `0.5 degree`
  test with `0.25` OD tolerance and a finite-only orbit assertion are not
  accepted. Include faithful fixed-slice, no-history, hard-cascade and
  unclamped-tile mutations plus material-change and camera-cut reset evidence.

Run only amended focused GPU/lifecycle fixtures, the affected controller and
private-pipeline aggregates, focused static checks and installed delivery if a
public/delivery file changes. After Architecture code closure, prepare one
matched Basic observation and one owner-controlled fast-rotation shadow
observation. Preserve the shared dirty tree; no standalone navigation edit,
commit, push, checkpoint, owner gate, `A9-G` or Planar work.

## A8-AR-018/019 execution result — 2026-09-01

- `SCENEGIS_GLOBE_CLOUD_TEMPORAL_MIP_SCALE` is the reference temporal value
  `0.25`; the compiled `CloudFS` witness rejects the former distance-only path.
- BSM STBN advances by rendered frame. History continuity now depends on valid
  ECEF reprojection plus projection/frustum/translation/Sun/material/quality
  compatibility rather than the shared visible-cloud orientation cut.
- History lookup is clamped to the selected tile's half-texel interior.
  Producer coverage and receiver selection share faded overlap, blended in
  transmittance space.
- Focused fixtures passed; final controller `77/77`, A1 `7/7`, and installed
  delivery `26/26` passed. The fixed Basic page was ready/HDR with zero errors;
  the single assigned fast rotation showed no persistent captured shadow trail.
- Correction resource/API/upstream/generated/SGP deltas are zero. The existing
  A8 BSM topology and byte budget are unchanged. The navigation page was not
  edited.

## A8-AR-020 through A8-AR-023 execution result — 2026-09-01

- Globe footprint propagation now converts the actual current Cloud MRT raster
  to the reference `ceil(resolved / 4)` current raster, then applies the fixed
  temporal mip scale `0.25`; the real compiled `CloudFS` witness and independent
  CPU equation agree.
- Globe shape/detail use base-level linear filtering only. Weather/turbulence
  remain mipmapped, occupancy remains conservative, and Planar is unchanged.
- The fixed-ECEF BSM authority covers nonuniform density, producer coverage,
  substantial rotation/orbit and a producer-covered cascade transition with a
  texel/integration/binary16-derived OD tolerance.
- BSM structured sampling uses the reference clamped `100..1000 m` period and
  the `stepSize * jitter` entry offset within the existing 25/50 step budgets.
- Focused reference, BSM and lifecycle fixtures pass `1/1`; final controller is
  `77/77` and A1 is `7/7`. Persistent Globe CloudCore bytes are `7,060,723`
  (`-304,274`); all resource/category counts and ownership boundaries remain
  unchanged.

## A8-AR-024 through A8-AR-028 execution result — 2026-09-01

- `CloudFS` and the shared march now carry distinct local ENU and normalized
  ECEF Sun authorities. Local direction owns phase and local Sun rays; ECEF
  direction owns Bruneton, ground irradiance and BSM.
- Cloud-body BSM filtering is selected by the receiver-normal/ECEF-Sun dot
  product. The global `.z` mutation fails on two receivers under one Sun.
- Local Sun OD ends at the reference-reported covered distance and BSM begins
  there; the accepted sky/ambient and opacity paths remain independent.
- Odd resolved targets use the exact reference raster
  `4 * ceil(resolved / 4)`. Globe shape/detail stay base-level linear, while
  weather/turbulence and occupancy keep their accepted contracts.
- Existing reference, receiver-filter, BSM and lifecycle fixtures pass; final
  controller/A1 results are `77/77` and `7/7`. Resource/API/upstream/generated/
  SGP deltas are zero.
- One fixed ground view, one direct rotation and one cloud-top view were
  inspected at the assigned owner material/radiance values. Runtime was
  ready/HDR with zero errors. No persistent captured trail was visible; soft
  ground shadows and the bright cloud-top deck remain owner-visible risks.

## A8-AR-029 execution result — 2026-09-01

- Globe BSM caster authority is now explicit: cumulus/stratus/mixed use only
  their shadow-enabled low layers; cirrus has no caster support.
- A single immutable JS layer table and in-place helper derive the shadow
  bottom/top used by both `u_sceneGISShadowCloudTop` and the frame-local Globe
  surface record. The GLSL support/density mirror uses the same offsets and
  thickness fractions.
- The existing BSM GPU fixture follows one fixed ECEF ground receiver across
  two bounded pitch/orbit states and reads current raw BSM, resolved BSM and
  actual Globe surface lighting. It rejects the former all-visible-layer and
  `base + thickness` authorities and proves cirrus zero output.
- Cloud lighting/color is frozen by owner correction. Resource/API/upstream/
  generated/SGP deltas are zero; no Planar or navigation-page work occurred.

### A8-AR-029 exact owner-camera continuation — 2026-09-01

- The two owner camera snapshots share one WGS84 terrain target but reproduced
  a translating shadow projection, superseding the earlier visual observation.
- The residual root was the pose-dependent cascade radius computed after
  nonlinear Globe corner mapping. The exact views produced
  `34911.980651 / 34895.930725 m`, changing world texel scale despite center
  snapping.
- Cascade center and coverage still use mapped Globe corners, while radius now
  comes from one pose-invariant analytic frustum/split bound. Both exact views
  produce `34913.065606 m` and identical receiver texel phase.
- The existing actual-GPU BSM fixture contains the exact owner cameras and a
  deterministic former-radius mutation. No new resource, public API, Planar,
  upstream or SGP surface is introduced.
- Final scoped validation passed: BSM GPU `1/1`, controller `76/76`, A1 `7/7`,
  focused ESLint/Prettier/Markdownlint and `git diff --check`.

### A8-AR-032 execution result — 2026-09-01

- The existing BSM fixture proves explicit fixed-position density and raw
  producer texels are invariant across the owner's exact two cameras.
- Stable analytic cascade extent, absolute light-grid reconstruction and
  camera-only integer texel displacement remove the coordinate drift without
  changing continuous cloud-advection semantics.
- Resolve history is clipped to the current finite `3x3` min/max range so an
  exact raw match survives publication. Raw, resolved and surface stages pass;
  mapped-radius and camera-derived inverse mutations fail.
- Resource, public API, upstream-owned, generated, SGP and Planar deltas are
  zero. The focused actual-GPU fixture passes `1/1`.
- One fresh final-source exact A-to-B gesture remained `ready · HDR` with zero
  errors and no abrupt whole-field translation. It used only new scene
  landmarks and did not attempt to recover the owner's pre-refresh clouds.

### A8-AR-033 execution result — 2026-09-01

- The previous shadow snapshot now retains three cascade half-sizes and atlas
  resolution; no allocation occurs per frame.
- Integer displacement requires stationary cloud material and exact grid-scale
  compatibility. A bounded FOV-scale transition retains fractional history,
  while the equal-scale owner A/B pitch gesture retains integer history.
- The amended existing actual-GPU fixture rejects unconditional rounding and
  passes `1/1`. Resource, API, upstream, SGP and Planar boundaries are unchanged.

### A8-AR-034 execution result — 2026-09-01

- `GridLatticeCompatible` requires exact resolution, per-cascade scale and the
  retained ECEF Sun direction, which is the deterministic light-basis authority.
- The owner fixed-Sun/equal-scale gesture stays integer; the FOV transition and
  one bounded `30 s` Sun transition stay history-valid and fractional.
- An actual-GPU mutation that ignores the basis condition rounds the Sun case
  and differs from product output. The focused fixture passes `1/1`; all
  resource/ownership/API boundaries remain unchanged.

## Phase closure — 2026-09-02

Architecture accepts the final A8 product, release delivery and evidence. All
findings from `A8-AR-001` through `A8-AR-034` are closed. The final scoped
automated evidence includes the production BSM GPU fixture, controller
aggregate, private A1 pipeline, installed package verifier, focused release E2E,
types, formatting, Markdown and upstream/generated audits recorded above.

The project owner explicitly passed the final interactive Globe shadow gate:
with Sun and cloud time fixed, changing camera pitch no longer causes the cloud
shadow field to translate across terrain landmarks. That judgment closes the
remaining owner-visible risk. The accepted A8 resource delta remains the
declared BSM temporal resolve budget; no public night-lighting API, Model/3D
Tiles consumer, Planar behavior, new upstream path or new SGP is part of this
phase.

The phase-closing local commit containing this record is the isolated A8-G
checkpoint and is not pushed. A successor phase requires a separate Architecture
activation from that checkpoint.
