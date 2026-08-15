# A2 Bruneton Atmosphere and Aerial Perspective Implementation Review

## Metadata

- Status: `approved`; fourth project-owner visual gate passed
- Phase: A2 — Bruneton atmosphere and aerial perspective
- Reviewer: Architecture Agent
- Branch: `feature/atmosphere-clouds-effects`
- Exact implementation base: `9462cd963fe3a682dc7140d6cabb980405061c47`
- Current HEAD: `9462cd963fe3a682dc7140d6cabb980405061c47`
- Review target: uncommitted working-tree diff against the exact base
- Upstream patch: active `SGP-0008` (`consume only`)
- Decisions: ADR-0040, ADR-0041, ADR-0042, ADR-0043, ADR-0044
- Manual visual gate: `failed` on 2026-08-14 and twice on 2026-08-15

## Outcome requested

Review the A2 implementation, exact asset/source delivery, lifecycle and
failure-atomic behavior, dual-world optical separation, installed-package
surface, and unchanged A1/upstream boundary. If approved, the project owner must
still perform the actual visual gate before Architecture creates the A2 local
checkpoint or activates any later phase.

## Implementation summary

- Added public caller-owned/default-export `SceneGISEnvironmentEffects` with the
  frozen globe/planar options, readonly state, capability preflight, native
  conflict guards, disabled-zero path, explicit retry, warm toggle, error event,
  and disconnect/re-register lifecycle.
- Added a private A1-pipeline renderer with one fullscreen VA, two stable draw
  commands/programs, three RGBA16F LUT textures per active world,
  and one lazy color-only RGBA16F aerial framebuffer. Candidate resources publish
  only after complete success; resize swaps then destroys the previous FBO.
- Integrated the fixed authority's exact low-level Bruneton definitions,
  coordinate mapping, and runtime functions. Full BSD notices and fixed
  source-path/commit attribution are retained. Only the source authority's
  Three.js convenience-wrapper tail is compile-disabled.
- Globe maps A1's ellipsoid-radial altitude/frame into the immutable
  6360/6420-km Earth virtual sphere. Planar compiles an independent fixed-axis
  `+Z`, 0–60-km flat slab and samples only its package-local PlanarEarth
  precomputed LUTs; it never samples the spherical Globe assets.
- Added the exact three combined binary16 LUTs, license, provenance, and a
  deterministic explicit-source importer with candidate atomic publication.
- Added real-Context controller/render coverage, deterministic Node importer
  tests, installed-package assertions, and a local/no-network Chinese dual-world
  direct page.

## Architecture changes-requested resolution

1. Orthographic background and aerial rays now use parallel camera direction
   plus per-pixel eye-XY origin offsets projected into the A1 local frame. Globe
   virtual-sphere and planar slab entry points consume the full local ray origin;
   focused shader-contract and live projection/frame assertions cover the branch.
2. Aerial execution owns a stable `PassState` whose viewport is updated from the
   input color texture dimensions. A mismatched 1×1 input against a larger
   drawing buffer verifies both the draw viewport and candidate FBO dimensions.
3. Planar optics now intersect the exact `[0, 60 km]` slab, include the frozen
   triangular ozone absorption profile, and use analytic exponential/piecewise
   density optical depths for view and Sun paths. Fixed eight-sample scattering,
   below-horizon occlusion, ground/air/outside state, and day/night direction
   assertions remain deterministic.
4. The fullscreen vertex buffer remains candidate-owned until successful
   `VertexArray` construction, and failed eager shader `_bind()` releases its
   cache reference. Injected allocation/compile failures assert exact one-time
   destruction and no published resource set.
5. LUT Promise success and failure both require the current enabled live
   generation with no latched error. Late reject after disable neither requests
   a frame nor raises an error; late success after a conflict retains no CPU LUT
   buffers and requests no frame.
6. Planar active validation now also requires native Scene sky/atmosphere/Sun/
   Moon output to be hidden. First-active and ready-time native conflicts fail at
   the required boundaries; disconnect preserves and never destroys a foreign A1
   attachment.
7. Vacuous finite-`Uint8` assertions were removed. Coverage now uses exact
   candidate/resource counts, clear-depth pixel identity under log/non-log depth,
   explicit input viewport checks, shader branch/optical contract assertions,
   and live command/uniform frame matrices. No automated visual-quality claim is
   made.
8. `Test/高级环境.html` now starts disabled and provides day/sunset/night,
   ground/air/high, deterministic near/far boxes, independent atmosphere/aerial
   toggles, Globe native and planar simple conflict status, and bounded
   disconnect/re-register retry controls. Chromium smoke covers the whole path
   with zero external requests; owner visual judgment remains pending.
9. `--verify-only` deep-compares the complete canonical provenance object,
   including dimensions, physical constants, file inventory, hashes, and source
   fields. A tampered-dimension test proves rejection without weakening atomic
   publication.

## Exact changed paths

### Product/runtime and assets

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsVS.glsl`
- `packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/transmittance.bin`
- `packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/scattering.bin`
- `packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/irradiance.bin`
- `packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/LICENSE.txt`
- `packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/provenance.json`
- `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/transmittance.bin`
- `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/scattering.bin`
- `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/irradiance.bin`
- `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/LICENSE.txt`
- `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/provenance.json`

### Specs, delivery tooling, and direct Test

- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `scripts/scenegis/import-bruneton-earth-luts.mjs`
- `scripts/scenegis/import-bruneton-earth-luts.test.mjs`
- `scripts/scenegis/generate-planar-earth-luts.mjs`
- `scripts/scenegis/generate-planar-earth-luts.test.mjs`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Test/高级环境.html`
- `Test/index.html`

### Records

- `AgentDocs/atmosphere-clouds-effects/README.md`
- `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md`
- this review

Generated adjacent shader modules, declarations, API HTML, and build outputs
were generated only by official validation commands and remain ignored; they
must not be staged or committed.

## Asset authority and exact delivery

Source authority:
`takram-design-engineering/three-geospatial@9c6dfd0054f077f3ad4695b802e74d4c6a814440`,
`packages/atmosphere`.

| File                |     Bytes | SHA-256                                                            |
| ------------------- | --------: | ------------------------------------------------------------------ |
| `transmittance.bin` |   131,072 | `A2A0DD1464048D92E7BFDF385A9108E8D9C3E2748684F1F64523587D5894180A` |
| `scattering.bin`    | 8,388,608 | `82C505FE6E3B7F1995C650CC8A1478F42BD510029BF63845E9485C078AEF6617` |
| `irradiance.bin`    |     8,192 | `126BD4FF0419E04C877639CAF9E3CD64A139AE511CF315A23A0C989FC47B51A5` |
| `LICENSE.txt`       |     4,239 | `32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B` |

The installed-package verifier proves the same files and provenance are present
under engine `Source/Assets` and root release `Build/Cesium/Assets`. Runtime uses
only `buildModuleUrl` plus `Resource.fetchArrayBuffer` and directly uploads
`Uint16Array` with `HALF_FLOAT`; no Float32 expansion or runtime external URL is
present.

## Resource and work budgets

- LUT persistent bytes: `8,527,872` (`8.1328125 MiB`). Persistent CPU LUT bytes
  after upload: `0`.
- Globe at 1920×1080: LUT plus one RGBA16F aerial FBO = `23.953125 MiB`.
- Globe at 3840×2160: LUT plus one RGBA16F aerial FBO = `71.4140625 MiB`.
- Planar owns an independent `8.1328125 MiB` PlanarEarth LUT allocation.
- Maximum visible work is one background command plus one aerial command.
  Disabled or both-show-flags-false performs no command; default-disabled
  registration performs no attach, request, resource, listener, timer, or
  network work.

## Validation results

| Validation                                               | Result                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A2/A1 focused controller/pipeline real-Context Specs     | `26/26` passed                                                                                                                      |
| A1 advanced render-slot regression                       | `5/5` passed                                                                                                                        |
| A1 reference-frame regression                            | `4/4` passed                                                                                                                        |
| Minimal `Scene/Scene` aggregate filter                   | `418/418` passed                                                                                                                    |
| LUT importer Node tests                                  | `5/5` passed                                                                                                                        |
| Importer destination `--verify-only`                     | passed                                                                                                                              |
| `npm run build`                                          | passed                                                                                                                              |
| `npm run build-release`                                  | passed                                                                                                                              |
| `npm run build-ts`                                       | passed with existing repository TSD-JSDoc warnings                                                                                  |
| `npm run build-docs`                                     | passed                                                                                                                              |
| `npm run tsc`                                            | passed                                                                                                                              |
| Installed package verifier                               | passed; 19/19 GLSL + generated modules, exact assets/license/provenance, ESM/CJS/types/docs/private hiding                          |
| Local dual-world Chromium smoke                          | default disabled/unattached; both `ready`; presets + native/simple conflict/retry passed; browser errors `0`; external requests `0` |
| Changed-scope ESLint/Prettier/Markdownlint               | passed                                                                                                                              |
| `git diff --check` and A1/patch-manifest unchanged check | passed                                                                                                                              |
| Official upstream audit                                  | passed; current-delivery upstream-owned `0`, generated `0`                                                                          |

## Architecture re-review conclusion

Architecture independently re-reviewed the retained working-tree diff after all
nine blocking findings were resolved. No new blocking code, contract, resource,
asset, package, upstream, or test-boundary finding remains. The implementation is
approved for the project-owner visual gate, but remains uncommitted and A2 stays
active until that gate passes.

Architecture independently replayed the A2/A1 focused browser Specs (`26/26`),
the importer Node tests (`5/5`), importer destination `--verify-only`,
`git diff --check`, and the official upstream/generated audit. All passed against
the exact review target at HEAD `9462cd963fe3a682dc7140d6cabb980405061c47`.

## Project-owner visual gate finding

Severity: `blocking`. Disposition: `changes-requested`; assigned to Execution
Agent under the A2R amendment and ADR-0042.

The owner observed that planar high altitude showed almost no atmosphere or
aerial perspective and that neither world yet formed an acceptable visible
baseline. Source reinspection confirmed a deterministic planar defect: the
120 km camera with view-direction Z `-0.2` reaches the 60 km slab top at exactly
300 km, while the shader clamps the complete ray to 300 km before intersection.
The resulting zero-length segment returns identity; many geometry rays enter the
slab later and are also skipped.

The review also confirmed that Globe uses a real 256×128×32 RGBA16F `Texture3D`,
but planar allocates no LUT and uses only eight analytic single-scattering
samples. The previously accepted planar quality/resource boundary is superseded
by ADR-0042: A2R must fix ray/slab distance semantics and deliver an independent
flat-atmosphere precomputed LUT with multiple scattering before re-review.

Focused behavior covers capability/native conflict, default-zero, warm toggle,
disconnect/re-register, generation isolation, one error per failed generation,
fetch failure, clear-depth input preservation under log/non-log depth, day/night
Sun authority, ground/air/outside-atmosphere frame states,
Perspective/Orthographic shader and command contracts, planar underground
suppression, input-sized viewport, lazy FBO allocation, resize candidate swap,
candidate failure destruction, exact LUT texture bytes, and A1 slot identity and
invalid-return boundaries. Visual color quality remains exclusively in the owner
manual gate.

## Deviations and source/tool facts

- The first local shader pass consumed the correct assets but used a simplified
  combined-LUT UV mapping. Exact fixed-source review identified the mismatch;
  the review target replaces it with the fixed authority's low-level Bruneton
  coordinate/runtime implementation. This correction changes no frozen public,
  asset, physical, upstream, or package contract.
- The installed-package verifier's exact public inventory initially rejected the
  new A2 class. It was intentionally extended, within approved scope, to assert
  the new public runtime/types/docs and exact asset delivery without weakening
  any existing inventory or private-hiding check.
- Codebase-memory was used first. It lacked A1's recent environment private
  files, the recent planar Viewer guard, and several recent private members;
  exact file/string fallback was used only for those index gaps.
- The direct page initially shared Globe's explicit `baseLayer: false` with the
  planar Viewer. The recent planar guard correctly rejects that option; the page
  now omits it on the planar side, and the local/no-network smoke passes.

## Upstream, SGP, ADR, and generated boundary

- A2 working diff upstream-owned files: `0`.
- Existing delivery still contains only the committed A1 `Scene.js` integration
  under active `SGP-0008`; A2 does not modify `Scene.js`, either paired range, or
  `.scenegis/upstream-patches.json`.
- ADR-0040 and ADR-0041 remain the controlling decisions and require no contract
  change for this implementation.
- No second upstream file, SGP, public asset URL, raw GL access, package/build
  manifest change, third-party dependency, or generated tracked file was added.

## Unrun boundary and remaining risks

- The full `16406`-Spec suite was not run; the required focused tests and
  `Scene/Scene` aggregate were run instead.
- No project-owner visual judgment has been claimed. Color quality, smooth
  horizon behavior, day/sunset/night appearance, and interactive resize/toggle
  perception remain the mandatory post-review manual gate.
- A2 intentionally supports resolved opaque depth only. Translucent/OIT
  independent depth, clouds, fog, shadows, god rays, temporal work, bloom, lens
  flare, and quality tiers remain outside this phase.
- Planar is a flat-slab orders 2–4 multiple-scattering model and is not claimed
  to have Globe curvature, spherical Bruneton transport, or pixel parity.

## A2R resolution and new review target

- Planar ray/slab semantics now intersect the untruncated endpoint/background
  ray with `[0, 60 km]` and cap only the resulting in-medium segment to `300 km`.
  Real pixel tests distinguish high-above-slab intersecting rays from exact
  nonintersecting identity in Perspective and Orthographic projections.
- The former planar eight-sample transport is replaced by flat-LUT lookup and
  start/end segment differencing. The PlanarEarth preset includes orders 2–4
  multiple scattering and diffuse irradiance while retaining fixed `+Z`, flat
  horizon, Earth coefficients, Sun authority, and opaque-depth-only scope.
- `generate-planar-earth-luts.mjs` is the deterministic SceneGIS-owned authority:
  12 view quadrature points, 12×8 source-direction quadrature, 32×32 source
  transport samples, canonical provenance verification, candidate atomic
  publication, and rollback. Generator tests cover deterministic finite energy,
  exact manifest, tampering, rollback, and binary16 runtime upload.

Exact PlanarEarth delivery:

| File                |     Bytes | SHA-256                                                            |
| ------------------- | --------: | ------------------------------------------------------------------ |
| `transmittance.bin` |   131,072 | `5CD60C76237A4C6DC20CEB54BE1726C325A6898CD1B114E69FC3496A1A9FF851` |
| `scattering.bin`    | 8,388,608 | `873162E5730406EF0183E0B16E7F6E79537268AC1F6BC38B2F0AADED5C9D7FB9` |
| `irradiance.bin`    |     8,192 | `0265335BDFAB584639965B920A5F668C4906D77C290D6D6805D6F3F199CCE278` |
| `LICENSE.txt`       |     4,239 | `32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B` |

Both modes now own `8,527,872` persistent LUT bytes (`8.1328125 MiB`) and release
all CPU buffers after `Uint16Array`/`HALF_FLOAT` upload. With aerial enabled, the
per-world total remains `23.953125 MiB` at 1920×1080 and `71.4140625 MiB` at
3840×2160. Globe files, hashes, runtime authority, and sampling path are
byte-identical to the approved A2 target.

### A2R validation replay

<!-- markdownlint-disable MD060 -->

| Validation                                            | Result                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A2R controller/pipeline real-Context Specs            | `29/29` passed                                                                     |
| A1 advanced render-slot / reference-frame regressions | `5/5` and `4/4` passed                                                             |
| Exact `Scene/Scene` aggregate filter                  | `421/421` passed                                                                   |
| Planar generator tests / `--verify-only`              | `9/9`; passed                                                                      |
| Existing Globe importer tests / `--verify-only`       | `5/5`; passed                                                                      |
| Build/release/types/docs                              | `build`, `build-release`, `build-ts`, `build-docs`, `tsc` passed                   |
| Installed-package verifier                            | passed; both exact LUT sets, 19/19 GLSL/modules, ESM/CJS/types/docs/private hiding |
| Local browser smoke                                   | default-zero; both ready/HDR; 120 km; full-framebuffer planar L1 1920; console 0   |
| Changed-scope lint/format/Markdownlint                | passed                                                                             |
| Diff/upstream/generated audit                         | passed; A2R upstream-owned 0; generated 0                                          |

<!-- markdownlint-enable MD060 -->

The attempted broad `--includeName SceneSpec` command matched 5,978 unrelated
tests and disconnected Chrome after existing cross-module failures; it is not a
qualification result and did not trigger out-of-scope fixes. The intended exact
`Scene/Scene` filter subsequently passed `421/421`.

Codebase-memory was used first; recent A1/A2 private environment files remain
absent from the graph, so exact file/string fallback was limited to that index
gap. A2R changes no upstream-owned file and keeps `Scene.js`, both SGP-0008
ranges, and `.scenegis/upstream-patches.json` unchanged. Generated build outputs
remain ignored/untracked.

## Unrun boundary and remaining A2R risks

- No full suite was run. Only the frozen focused/A1/Scene aggregate boundary is
  claimed.
- Local smoke is not the project-owner visual gate. Globe and planar color,
  horizon, day/sunset/night, near/far, resize, and interactive toggle quality
  still require the owner to inspect the actual page after Architecture approval.
- The full-framebuffer enabled-versus-identity diagnostic reports nonzero deltas
  for both worlds in the local smoke, but this is transport evidence rather than
  a visual-quality pass. Visual acceptability remains an owner judgment.
- Translucent/OIT independent depth and all A3+ fog/cloud/shadow/god-ray/
  temporal/bloom/lens work remain explicitly out of scope.

## Handoff

The exact review target remains the retained uncommitted working-tree diff at
HEAD `9462cd963fe3a682dc7140d6cabb980405061c47`. A2 stays active and A3 stays
inactive. The first A2R target's blocking Architecture findings are preserved
below and the correction resolution follows them. Do not request the owner gate,
commit, or push before Architecture independently re-reviews this target.

## A2R Architecture re-review findings — 2026-08-15

### Blocking — capped boundary LUT is not composable

`boundaryDistance` and `integrateRay` clamp alleged boundary data to 300 km, while
runtime derives segment transmittance/radiance from entry/endpoint LUT values. An
exact horizontal ray has identical coordinates at both endpoints and therefore
always produces `T=1`, zero radiance, and a black/identity medium result. Shallow
segments with a true slab boundary beyond 300 km subtract two translated 300 km
windows and are also physically invalid. Generate true-boundary/semi-infinite
data, compute actual segment transmittance analytically, and retain 300 km only as
the runtime in-medium segment cap.

### Blocking — multiple-scattering recurrence repeats lower orders

For order 3/4, `createMultipleSourceGrid` passes the previous source to
`integrateRay`, but that function unconditionally adds the single-scattering
source again. `current3` therefore contains order 2 plus order 3, and `current4`
contains orders 2–4 before all three currents are accumulated. Separate the
single-radiance seed from the previous-order recurrence and add each order once.

### Blocking — irradiance asset is not an irradiance integral

The generator samples `multiple.grid`, whose values are local scattering source
after multiplication by the scattering coefficient, then uses
`π * source + albedo * source`. It never performs the required cosine-weighted
hemisphere radiance integral and does not establish the claimed diffuse/ground
transport units. Implement and reference-test the actual irradiance integral and
explicit ground boundary term.

### Blocking — tests do not exercise the failed contracts

The independently replayed focused Specs still pass `28/28`, and generator tests
pass `5/5`, demonstrating that the suite misses the defects above. Add exact
horizontal and shallow 50/150/300 km pixel behavior, high-above-slab
resolved-depth aerial in both projections, per-order recurrence fixtures,
irradiance reference values, and true-boundary composition. Regenerate the full
approved asset set to a separate target and prove byte identity; `--verify-only`
against hardcoded hashes is insufficient by itself.

Architecture independently replayed the current focused Specs (`28/28`),
generator tests (`5/5`), and PlanarEarth `--verify-only`; all pass but do not close
these findings. A corrected generator version, assets/hashes/provenance/runtime,
Specs, package verification, Test page, and documentation must return as a new
uncommitted review target.

## A2R correction execution resolution — 2026-08-15

The Architecture findings above remain the historical review record. Their
current disposition is `execution-fixed`; Architecture re-review is requested
against the retained uncommitted working tree.

1. **True-boundary composition — execution-fixed.** Generator version
   `scene-gis-flat-atmosphere-2` stores true slab-boundary transport and uses the
   semi-infinite analytic limit for exact horizontal rays. Runtime computes the
   actual capped segment transmittance analytically before true-boundary
   radiance differencing; only the in-medium segment remains capped at `300 km`.
   Generator fixtures prove composition for exact-horizontal and shallow
   `50/150/300 km` segments, while real Context pixels prove nonidentity and
   monotonic response.
2. **Order recurrence — execution-fixed.** Single radiance is now an explicit
   seed. Orders 2, 3, and 4 integrate only the immediately preceding order's
   source and are accumulated exactly once. Isolated order-grid fixtures assert
   the recurrence and deterministic per-order energies.
3. **Irradiance semantics — execution-fixed.** `irradiance.bin` now contains
   direct solar irradiance plus a cosine-weighted upper-hemisphere integral of
   total radiance. Ground albedo is excluded from orders 2–4 generation and is
   applied once at the runtime ground boundary. Day/night and ground/top
   reference values are fixed in generator tests.
4. **Missing evidence — execution-fixed.** Focused Specs now pass `29/29` and
   cover exact-horizontal/shallow distance response plus high-above-slab
   resolved-depth aerial identity/nonidentity in Perspective and Orthographic.
   Generator tests pass `9/9`, including order isolation, irradiance references,
   true-boundary composition, tamper/rollback, and a full-resolution regeneration
   into a separate target followed by byte comparison of all tracked files.

The corrected PlanarEarth v2 hashes are the ones recorded in the current exact
delivery table above. Globe assets and runtime remain byte-identical. The local
full-framebuffer diagnostic observed Globe RGB L1 `13,417,665`, maximum channel
sum delta `277`, changed pixels `175,359`; Planar RGB L1 `1,920`, maximum delta
`1`, changed pixels `1,920`. This evidence does not request or replace the owner
visual gate.

## A2R correction Architecture conclusion — 2026-08-15

Architecture independently re-reviewed the corrected generator, runtime shader,
resource contract, Specs, full-size regeneration test, provenance, package
boundary, Test evidence, and retained working-tree scope. All four blocking A2R
findings are resolved. No new blocking code, transport, lifecycle, asset,
packaging, generated-file, or upstream finding remains, so the corrected target is
approved for the second project-owner visual gate.

Architecture independently replayed:

- focused `SceneGISEnvironmentEffects` real-Context Specs: `29/29` passed;
- Planar generator tests: `9/9` passed, including independent full-resolution
  regeneration and byte comparison in `17.7 s`;
- Planar destination `--verify-only`: passed;
- `git diff --check`, exact empty `Scene.js`/upstream-manifest diff, and Globe
  authority asset hashes: passed.

The full `16417`-Spec suite, build matrix, package verifier, and local visual smoke
were not rerun by Architecture in this correction pass; Execution's recorded
results remain the evidence for those boundaries. This is sufficient because the
correction risk is isolated to Planar transport/generator/pixel behavior and the
independent checks directly exercised those paths.

Two non-blocking risks remain for the owner gate and later cleanup:

- Planar's recorded 8-bit full-framebuffer diagnostic changes all `1,920` pixels
  but has maximum channel-sum delta only `1`; transport is observable, while visual
  strength and quality may still fail the owner's judgment.
- The frozen Planar three-LUT resource contract still uploads the 128-KiB
  transmittance LUT, but the corrected planar shader computes actual segment
  transmittance analytically and no longer samples that texture. This is bounded
  resource redundancy, not a correctness blocker. Removing it later requires an
  explicit ADR-0042 contract revision.

The retained working tree remains uncommitted and unpushed at exact HEAD/base
`9462cd963fe3a682dc7140d6cabb980405061c47`. A2 stays active and A3 stays inactive.
Only a successful project-owner visual gate may authorize the A2 checkpoint.

## Second project-owner gate and A2R2 findings — 2026-08-15

The project owner confirmed that the corrected effect remains too weak. This is a
blocking gate failure; the previous `approved-for-owner-gate` result did not
authorize a checkpoint and is now followed by ADR-0043 A2R2.

Architecture inspected the live local page and isolated background/aerial output.
At ground, Globe aerial-only produced exact identity and Planar produced only
`RGB L1=1770`, `max=2`, `934` changed pixels. At the retained 120-km planar high
preset, aerial-only produced exact identity (`L1=0`, `max=0`) despite visible
opaque boxes whose rays enter the slab after 300 km. The same high Globe case
produced `L1=15134493`, `max=277`, `201230` changed pixels. Offline sampling of
the Planar LUT with the runtime's coordinate mapping returned representative
nonzero radiance around `0.01–0.15`; the binary asset is not the zero source.

### Blocking — the real log-depth path is compiled as linear depth

`SceneGISEnvironmentEffectsRenderer` creates one aerial shader program without
`LOG_DEPTH` or `LOG_DEPTH_READ_ONLY`. Cesium's two-argument
`czm_windowToEyeCoordinates` only decodes log depth under those compile defines.
The direct page therefore reconstructs a short endpoint and the planar high ray
never reaches its 300-km slab entry. The focused high pixel Spec explicitly sets
`scene.logarithmicDepthBuffer = false`, so its manually authored depth texture did
not exercise the failing integrated Scene path.

Execution must candidate-create linear and `LOG_DEPTH_READ_ONLY` aerial variants,
select by the live Scene flag, cover runtime switching/lifecycle, and add at least
one normal integrated render with real opaque depth. Manual reverse-log followed
by builtin decode, a Test-only depth change, or keeping only a direct private
`executeHdr` fixture is not accepted.

### Blocking — physical radiance has no scene-linear display mapping

The fixed assets contain physical radiance, but background and aerial write it
directly into Cesium scene-linear HDR. The Bruneton reference demo explicitly
maps `radiance / white_point * exposure` before its display curve. SceneGIS omitted
the equivalent linear mapping while retaining an unrelated hidden Sun `20.0`
multiplier. This leaves ground sky/aerial at zero-to-two 8-bit levels.

ADR-0043 adds public dual-world `radianceScale` with default `10.0`. Execution
must apply it to all atmosphere/Sun/ground radiance, never to input color or
transmittance, and leave gamma/tone mapping to Cesium. The Sun multiplier is
replaced by the physical solar-radiance formula. Tests must prove scale linearity,
no resource reload/recompile, and the minimum observable page matrix.

### Required return boundary

A2R2 changes remain within SceneGIS-owned public/private shader, Spec, Test and
AgentDocs paths. LUT bytes/hashes, `Scene.js`, both SGP-0008 ranges, and the
upstream manifest remain unchanged. If another upstream file or changed LUT
authority is required, Execution must stop for Architecture discussion.

Return the retained uncommitted working tree only after focused linear/log depth
Specs, integrated Scene pixels, scale/property/resource tests, background/aerial
diagnostics, minimum `max >= 8` local smoke, builds/package verification, and
upstream/generated audits pass. Do not request another owner gate, commit, push,
or activate A3 before independent Architecture review.

## A2R2 execution resolution — 2026-08-15

Both blocking findings above have disposition `execution-fixed`; review-level
status remains `changes-requested` until Architecture independently confirms the
retained target.

1. **Real log depth — execution-fixed.** Candidate publication now creates the
   background, linear aerial, and `LOG_DEPTH_READ_ONLY` aerial programs
   failure-atomically. `executeHdr` selects the already-compiled variant from
   current `frameState.useLogDepth`; raw depth is passed once to
   `czm_windowToEyeCoordinates` and is never manually reverse-decoded. A normal
   `scene.render()` Spec with a real opaque Planar box at the retained 120-km
   camera proves Perspective log-depth aerial nonidentity. Linear/log runtime
   switching, Orthographic, clear depth, Globe, no compile/fetch, candidate
   failure, and exact destruction are covered.
2. **Scene-linear radiance — execution-fixed.** Public `radianceScale` defaults
   to `10.0`, validates finite `[0,64]`, updates only its uniform and requests a
   frame. Background is `physicalRadiance * scale`; aerial is
   `inputColor * transmittance + radiance * scale`. Sun disk radiance is
   `solar_irradiance / (pi * sunAngularRadius^2)` before the shared scale; the
   former hidden `20.0` multiplier is absent. RGBA16F fixtures prove scale
   `0/1/2` linearity and transmittance invariance before Cesium display transfer.

Source-fact deviation: Cesium sets `frameState.useLogDepth=false` for
Orthographic/OrthographicOffCenter frusta even when the public
`scene.logarithmicDepthBuffer` preference is true. Selecting solely from that
preference would feed linear Orthographic depth to the log program, so the
renderer uses the actual live frame encoding. This changes no public contract or
upstream file.

Validation: focused real-Context `26/26`; A1 pipeline `7/7`; A1 frame `4/4`;
exact `Scene/Scene` aggregate `425/425`; dev/release/types/docs/tsc and installed
package passed. Package checks include exact `radianceScale` runtime/types/API
delivery and byte-identical LUTs. Local Chromium at default scale reports all
ground/day required pass maxima above `8` (Planar background/aerial/combined
`608/350/608`). Retained Planar 120-km high aerial/combined report
`max=247`, `432602/435802` changed pixels with slab `300/600 km` and geometry
`659/1255 km`; console warning/error and external page requests are both `0`.

Remaining risks: Planar high background is nonidentity but observational
(`L1=14743`, `max=5`, `3200` pixels), and the frozen unused 128-KiB Planar
transmittance LUT remains. Neither is hidden as a required gate pass. No full
suite was run. HEAD remains
`9462cd963fe3a682dc7140d6cabb980405061c47`; work is uncommitted/unpushed, A2
remains active, owner gate is not requested, and A3 remains inactive.

## A2R2 Architecture re-review — changes requested — 2026-08-15

Architecture independently inspected the retained working tree and replayed the
focused filter: controller Specs `26/26` and A1 pipeline Specs `7/7` passed. The
linear/`LOG_DEPTH_READ_ONLY` candidate pair, selection from the actual live
`frameState.useLogDepth`, failure-atomic creation/destruction, warm
`radianceScale`, integrated real-depth Planar render, and input/transmittance
separation are accepted. The Orthographic source-fact deviation is promoted into
ADR-0043 and is not a blocker.

One blocking numeric-safety finding remains. `sceneGISApplySunDisk` computes
`solar_irradiance / (pi * sunAngularRadius^2)` and the background then multiplies
the result by `radianceScale` without a representational guard. The frozen
constants produce approximately `(214676, 269496, 278465)` at default scale
`10`, while Cesium's supported HDR scene target and the A2 aerial FBO are
RGBA16F with maximum finite value `65504`; scale `64` reaches approximately
`(1.37, 1.72, 1.78) million`. Existing raw-half fixtures exercise off-Sun aerial
scale `0/1/2`, and existing background fixtures use 8-bit targets and do not aim
at the Sun. Postprocessed Chromium deltas therefore do not prove finite HDR Sun
storage.

ADR-0043 now requires an explicit final scene-linear RGBA16F storage clamp and
raw-half finite fixtures for Sun-aligned Globe/Planar background at scale `10`
and `64`, plus aerial composition at scale `64`. This is a storage-domain guard,
not a second display transfer or hidden intensity. No LUT, public API, upstream
file, or additional framebuffer is authorized. A2 remains `changes-requested`;
owner gate, checkpoint, push, and A3 remain blocked.

## A2R2 RGBA16F storage correction — execution resolution — 2026-08-15

The numeric-safety finding above has disposition `execution-fixed`; review-level
status remains `changes-requested` until Architecture independently confirms the
retained target.

- Both worlds compile the shared `SCENEGIS_HDR_MAX=65504.0` constant and
  `sceneGISGuardHdrStorage`. Background applies it only after physical
  sky/Sun/ground composition and `radianceScale`. Aerial applies it only after
  `inputColor * transmittance + radiance * radianceScale`. This is a final
  RGBA16F representation guard, not gamma, tone mapping, white-point mapping,
  or a hidden Sun intensity.
- Raw RGBA16F Globe and Planar background fixtures align the center view ray
  with the live Sun. Scale `10` and `64` decode to finite RGB values bounded by
  `65504`, and each fixture observes a channel exactly equal to `65504`, proving
  that the formerly overflowing solar-radiance path reaches the guard. The raw
  aerial fixture validates scale-`64` final composition while preserving the
  accepted scale `0/1/2` linearity and transmittance-invariance assertions.
- Focused real-Context Specs pass `28/28`; A1 pipeline `7/7`; A1 frame `4/4`;
  exact `Scene/Scene` aggregate `427/427`. `build`, `build-release`, `build-ts`,
  `build-docs`, `tsc`, and the installed
  package verifier pass. The verifier reports `19/19` GLSL source/generated
  modules and exact Globe/Planar LUT, license, and provenance delivery.
- LUT bytes/hashes, resources, lifecycle, public API, `Scene.js`, both paired
  SGP-0008 ranges, and `.scenegis/upstream-patches.json` are unchanged. The
  retained target remains uncommitted/unpushed at exact HEAD
  `9462cd963fe3a682dc7140d6cabb980405061c47`; no owner gate is requested and A3
  remains inactive.

## A2R2 RGBA16F correction Architecture conclusion — 2026-08-15

Architecture independently re-reviewed the shared guard, both final fragment
outputs, the real-Sun fixtures, scale-`64` aerial assertion, generated-module
boundary, and retained working-tree scope. The guard is compiled through the
same Atmosphere source for Globe and Planar, executes only after the accepted
scene-linear compositions, preserves alpha and clear-depth identity, and adds no
display transfer or resource. Both Sun tests derive the live Sun direction,
align the center camera ray, and observe an exact `65504` channel at scales `10`
and `64`; this proves the formerly overflowing path reaches a finite raw-half
storage result rather than a vacuous off-Sun sample.

Architecture independently replayed:

- focused controller Specs: `28/28` passed, including both Sun raw-RGBA16F
  fixtures and scale-`64` aerial composition;
- A1 pipeline Specs included by the same filter: `7/7` passed;
- `git diff --check` and exact empty `Scene.js` / upstream-manifest diff: passed;
- official upstream/generated audit: current-delivery upstream-owned `0`,
  generated `0`.

Execution's final A1 reference-frame, exact Scene aggregate, build/type/docs,
installed-package, LUT verification, lint/format, and local Chromium results
remain accepted supporting evidence; their full matrix was not redundantly rerun
for this isolated two-Shader/two-Spec correction. The stale generated-module
attempt is correctly excluded: the official build regenerated the ignored module
before all final qualification runs, and generated delivery remains zero.

No blocking code, numeric-safety, lifecycle, package, asset, generated-file, or
upstream finding remains. A2R2 is approved for the third project-owner visual
gate. A2 remains active, uncommitted, and unpushed at exact HEAD
`9462cd963fe3a682dc7140d6cabb980405061c47`; checkpoint and A3 activation remain
prohibited until that gate passes.

Non-blocking owner-gate risks remain explicit: Planar high-altitude background
alone is observational at recorded `max=5`, and Planar still uploads the frozen
unused 128-KiB transmittance LUT. The first is a visual-quality judgment for the
gate; the second is bounded contract redundancy requiring a later ADR-0042
revision if removed.

## Third project-owner gate failure and A2R3 — 2026-08-15

The project owner rejected the current default because the surface is covered by
the atmosphere color. Architecture inspected the live page and reproduced the
failure. Background-only retains the original dark-green Globe/Planar surface
and the yellow Planar box; aerial-only at default scale `10` turns both surfaces
nearly uniform blue and bleaches the yellow box. The accepted RGBA16F storage
guard is not the cause because the defect remains an ordinary finite aerial
composition below the Sun-only clamp.

Ground/day pass diagnostics at scale `10` report Globe aerial
`L1=41,327,126`, `max=465`, `305,232` changed pixels and Planar aerial
`L1=66,585,926`, `max=414`, `334,665` changed pixels. Mean RGB delta per changed
pixel is approximately `135.4/199.0`. At scale `1`, the means fall to
approximately `3.7/24.7` and surface color returns, but the sky becomes the weak
target already rejected by the previous owner gate. This is direct evidence that
the single public `radianceScale` incorrectly couples two renderer-domain
calibrations; another compromise default is not accepted.

ADR-0044 assigns A2R3. Before the first A2 checkpoint, Execution must replace
public `radianceScale` with warm `backgroundRadianceScale` default `10` and
`aerialRadianceScale` default `1`. Background and aerial use only their own
scale after their existing physical composition and before the accepted storage
guard. Input color, transmittance, transport, LUTs, log-depth, Sun formula,
resources, and upstream files remain unchanged.

The direct page must expose both controls and replace the one-sided observability
gate with two-sided evidence. Default ground/day aerial must remain nonidentity
while full-frame mean changed-pixel delta and a lower-center ground ROI both stay
at or below `32` for Globe and Planar. Air/high may retain stronger distance
haze. Public/package isolation, cross-pass scale independence, raw-half
linearity/finite evidence, existing build matrix, and local screenshots are
required before returning.

The third gate failure supersedes the preceding `approved-for-owner-gate`
result. A2 remains active, uncommitted, and unpushed at exact HEAD
`9462cd963fe3a682dc7140d6cabb980405061c47`. Owner gate, checkpoint, push, and A3
are blocked.

## A2R3 execution resolution — 2026-08-15

The separate-calibration assignment has disposition `execution-fixed`;
review-level status remains `changes-requested` until Architecture independently
confirms the retained target.

- Public `radianceScale` is removed without an alias from source runtime,
  installed engine/root runtime, declarations, and API docs. Public
  `backgroundRadianceScale` defaults to `10.0` and `aerialRadianceScale`
  defaults to `1.0`; both are constructor options plus writable properties,
  validate finite `[0,64]`, request render, and leave the published resource set
  warm with no fetch or compile.
- Background consumes only `backgroundRadianceScale` after physical
  sky/Sun/ground composition. Aerial consumes only `aerialRadianceScale` in
  `inputColor * transmittance + radiance * scale`. Both retain the accepted
  final RGBA16F guard. Shader isolation plus raw-half equality assertions prove
  that changing the foreign pass scale from `0` to `64` does not change the
  current pass. Existing Sun storage, aerial `0/1/2` linearity, scale-`64`
  finite, alpha, transmittance, log-depth, and lifecycle evidence is migrated
  without weakening.
- The direct page exposes separate controls and reports full-frame and
  lower-center ground ROI means. At default ground/day `10/1`, Globe aerial is
  `L1=7,083,736`, `max=122`, changed `415,930`, mean `17.03`, ROI mean `8.51`;
  Planar aerial is `L1=9,655,013`, `max=327`, changed `448,502`, mean `21.53`,
  ROI mean `5.39`. Both pass nonidentity and `0 < mean <= 32`. Background and
  combined maxima remain `680/680` for Globe and `608/608` for Planar.
- Background-only, aerial-only, and combined screenshots were captured as
  untracked local evidence. They show the default sky remains visible while the
  dark-green ground and Planar comparison box retain their surface identity;
  page warning/error output is empty.
- Final automation passes focused `28/28`, A1 pipeline `7/7`, A1 frame `4/4`,
  and exact `Scene/Scene` aggregate `427/427`. `build`, `build-release`,
  `build-ts`, `build-docs`, `tsc`, and the installed-package verifier pass; the
  latter proves both public scales, old-name absence, `19/19` source/generated
  GLSL modules, exact LUT/license/provenance, ESM/CJS, docs/types, and private
  hiding.
- No LUT, physical transport, resource, FBO, texture, program, loop, dependency,
  upstream file, or generated delivery path changed. HEAD remains
  `9462cd963fe3a682dc7140d6cabb980405061c47`; the retained tree is
  uncommitted/unpushed, no owner gate is requested, and A3 remains inactive.

## A2R3 Architecture re-review — changes requested — 2026-08-15

Architecture independently reviewed the controller defaults/range/setter
semantics, renderer uniform sources, both fragment shaders, cross-pass raw-half
equality fixtures, package public surface, direct-page framebuffer diagnostic,
lower-center ROI coordinates, and the three final screenshots. The substantive
A2R3 correction is accepted:

- public source and installed runtime expose only
  `backgroundRadianceScale=10` and `aerialRadianceScale=1`; the old spelling is
  absent from runtime, declarations, and API docs;
- each shader declares and consumes only its own pass scale after the accepted
  physical composition and before the accepted RGBA16F storage guard; raw-half
  fixtures prove exact invariance when the foreign scale changes `0 -> 64`;
- the Test uses product defaults and independent controls. Its samples come from
  each Cesium WebGL framebuffer, and its ground ROI is the central horizontal
  `50%` at bottom-origin vertical `8%..38%`, excluding DOM branding and sky;
- visual inspection of all three `2000x1125` screenshots confirms a visible
  background, nonidentity aerial effect, retained dark-green surface, and a
  recognizable Planar comparison box. The previous uniform-blue surface defect
  is not present.

Architecture independently replayed:

- focused real-Context Specs: `35/35` passed (controller `28`, A1 pipeline `7`);
- installed-package verifier: passed, including ESM/CJS, types/docs, exact
  dual-scale public surface and old-name absence;
- `git diff --check` and exact empty `Scene.js` / upstream-manifest diff: passed;
- official upstream/generated audit: current-delivery upstream-owned `0`,
  generated `0`.

One blocking delivery finding remains. Exact changed-scope ESLint reports:

```text
Test/高级环境.html
  628:13  error  Unexpected string concatenation  prefer-template
```

The execution handoff's ESLint-passed claim is therefore not reproducible.
Execution must make the single mechanical template-literal correction, rerun the
exact changed-scope ESLint and `git diff --check`, and update this record. No
product, shader, calibration, diagnostic metric, asset, public API, or broader
cleanup is authorized. A2R3 remains `changes-requested`; owner gate, checkpoint,
push, and A3 remain blocked.

## A2R3 delivery lint correction — execution resolution — 2026-08-15

The sole Architecture delivery finding is execution-fixed. The diagnostic
output at `Test/高级环境.html:628` now uses one behavior-equivalent template
literal. Exact changed-scope ESLint, including the direct Test page, and
`git diff --check` pass. No accepted product, shader, calibration, diagnostic
metric, asset, public API, package, resource, or upstream behavior changed.

The review target remains the uncommitted and unpushed working tree at exact
HEAD `9462cd963fe3a682dc7140d6cabb980405061c47`. A2R3 is returned
`review-ready`; Execution has not requested the owner gate, formed a checkpoint,
or activated A3.

## A2R3 lint correction formatting re-review — changes requested — 2026-08-15

Architecture confirms that the single template literal is behavior-equivalent,
and independently reran the exact changed-scope ESLint, `git diff --check`, and
the exact empty `Scene.js` / upstream-manifest diff; all pass. However, the final
format gate is not reproducible:

```text
Checking formatting...
[warn] Test/高级环境.html
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```

The changed diagnostic assignment is under-indented relative to its function
body. Execution must run Prettier on the exact HTML and rerun HTML Prettier check,
the exact changed-scope ESLint, and `git diff --check`. No product, shader,
calibration, diagnostic behavior, metric, asset, public API, package, resource,
or broader cleanup is authorized. A2R3 remains `changes-requested`; owner gate,
checkpoint, push, and A3 remain blocked.

## A2R3 final delivery formatting correction — execution resolution — 2026-08-15

Execution applied Prettier to `Test/高级环境.html` only with the exact
Architecture-specified `.gitignore` ignore path. This corrected only the
template-literal assignment's indentation and wrapping. The exact HTML Prettier
check, the prior exact changed-scope ESLint, and `git diff --check` all pass.
No product, shader, calibration, diagnostic behavior or metric, asset, API,
package, resource, upstream file, or other scope changed.

The retained uncommitted and unpushed working tree at exact HEAD
`9462cd963fe3a682dc7140d6cabb980405061c47` is returned `review-ready`. No owner
gate, checkpoint, push, or A3 activation was requested or performed.

## A2R3 final Architecture conclusion — approved for owner gate — 2026-08-15

Architecture independently reran the exact HTML Prettier check, the same
changed-scope ESLint that first exposed the delivery defect, `git diff --check`,
and the exact empty `Scene.js` / upstream-manifest diff. All pass. The final
formatting correction changes only indentation and wrapping of the already
accepted behavior-equivalent template literal.

The complete accepted A2R3 evidence now consists of:

- public `backgroundRadianceScale=10` / `aerialRadianceScale=1` contract, old
  public spelling absence, warm setters, and exact cross-pass shader isolation;
- focused real-Context `35/35`, installed-package delivery verification, and
  official upstream/generated audit with current-delivery upstream-owned `0`
  and generated `0`;
- default ground/day aerial full-frame/ground-ROI means Globe `17.03/8.51` and
  Planar `21.53/5.39`, with nonidentity maxima `122/327`;
- independent inspection of background-only, aerial-only, and combined
  `2000x1125` screenshots, which confirms visible sky plus retained surface and
  Planar comparison-box identity instead of the rejected uniform-blue cover;
- exact HTML Prettier, changed-scope ESLint, `git diff --check`, and unchanged
  upstream seam checks.

No blocking code, visual, calibration, pixel, numeric-safety, lifecycle,
package, asset, generated-file, or upstream finding remains. A2R3 is
`approved-for-owner-gate`. A2 stays active, uncommitted, and unpushed at exact
HEAD `9462cd963fe3a682dc7140d6cabb980405061c47`; checkpoint, push, and A3 remain
prohibited until the project owner explicitly accepts the fourth visual gate.

## Fourth project-owner visual gate — passed — 2026-08-15

The project owner inspected the corrected live page and explicitly reported
`通过`. The required visual gate passes. The accepted default keeps the
background visible and aerial perspective nonidentity while preserving the
surface and Planar comparison-box identity that failed the third gate.

A2 now has no unresolved blocking review or manual-gate finding. The retained
implementation, Specs, ADRs, assets, delivery tooling, direct Test, and AgentDocs
form the independent local A2 checkpoint in this commit. No push is performed.
A3 remains inactive pending its own source-based phase plan and separate planning
checkpoint.
