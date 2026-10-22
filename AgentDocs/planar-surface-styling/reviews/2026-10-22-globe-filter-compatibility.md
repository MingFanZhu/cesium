# Review: Planar imagery follows Globe

## Metadata

- Type: technical self-review; status: approved, owner visual feedback pending.
- Created/updated: 2026-10-22; author/reviewer: current architecture/execution task.
- Target: `scenegis/develop` at `acd9cddbb0` plus this focused change.
- Plan: [Globe compatibility](../plans/2026-10-22-globe-filter-compatibility.md).
- Decision: ADR-0031 amendment; related audit findings F1/F2.
- Modified upstream-owned files / SGP: none.

## Implementation and review

Only two SceneGIS-owned runtime files change: `_SceneGISPlanarSurface.js` and
`_SceneGISPlanarSurfaceShader.js`. Raw color-to-alpha precedes the draw-wide gamma
branch, followed by brightness, contrast, hue, saturation and alpha composition.
GlobeFS and GlobeSurfaceTileProvider remain unchanged. No exposure, white balance,
material, light or atmosphere compensation is introduced.

One boolean is published alongside each tile's existing slots and read by a
uniform. READY images with nonzero layer alpha select the branch; hidden,
unready and uncovered layers do not. A READY image masked by color-to-alpha
still counts, matching Globe. Selected ancestor images also qualify because
selection only publishes READY entries. Empty worlds retain lazy imagery state.
Depth/pick replay uses the last normal-render snapshot. No new shader key, pass,
texture, command or per-frame collection is introduced.

Findings and disposition:

- F1 / P1, owner architecture/execution: cross-world non-default filter mismatch
  fixed. The pre-fix regression had 49 passing / 4 failing tests, including an
  actual GPU blend mismatch. All 53 Surface/Shader tests now pass.
- F2 / P2, owner execution: old Widget blend expectations fixed using independent
  linear composition arithmetic. The initial readiness assertion is false because
  adding a shown layer immediately invalidates readiness; loading restores true.
  All 12 Widget cases pass, including maximum sampler count and resource reuse.
- C1 / accepted by owner: gamma=1 branch discontinuity and effects on other layers
  in the same draw are intentional native compatibility. They are documented in
  ADR-0031, Architecture and DevelopmentGuide, not treated as a remaining fix.

## Verification

| Check                                            | Result                                 |
| ------------------------------------------------ | -------------------------------------- |
| Surface + Shader GPU Specs, WebGL validation     | 53 passed                              |
| Imagery Widget GPU Specs, WebGL validation       | 12 passed                              |
| Dev browser comparison / native PBR controls     | 3 passed                               |
| Release browser comparison / native PBR controls | 3 passed                               |
| Full development and release builds              | passed                                 |
| Type generation and `npm run tsc`                | passed; existing JSDoc warnings remain |

Browser fixtures compare the same two local image layers in both worlds, all five
filters, combined filters, gamma 1/1.001/2, raw masking, hidden/zero-alpha layers,
HDR/LDR and default RGB/alpha composition. Paired output differs by at most one
8-bit channel value (the accepted tolerance is two). Screenshots from both build
products were inspected in `Build/Specs/e2e/imagery-globe-compatibility-comparison.png`.
These controlled images isolate color processing; they do not establish distant
atmosphere or arbitrary asset equivalence.

At 1280×800, one tile/two layers, 60 warm frames alternating gamma 1/2 and waiting
for GPU completion: dev median/p95 0.4/0.6 ms; release 0.3/0.8 ms. Request, binding,
texture, shader and command identities/counts stay unchanged; one draw remains.
These local timings bound the fixture, not total GIS scene performance. Existing
GPU tests also verify texture/VA destruction and borrowed Material lifetime.

Logs and measurements are ignored under `Build/Specs/imagery-globe-compatibility-*`
and `Build/Specs/e2e/imagery-globe-compatibility-{dev,release}`. Generation output is
not edited or committed. Static checks are recorded in the plan outcome.

## Remaining boundaries

Planar retains its opaque base composition and world opacity contract. Globe's
extra capabilities such as day/night alpha, cutout, split and multi-pass imagery
are outside this fix. Existing Planar imagery with tuned non-default filters will
change appearance to the native reference. No new unresolved technical finding;
owner visual feedback remains separate from this technical approval.
