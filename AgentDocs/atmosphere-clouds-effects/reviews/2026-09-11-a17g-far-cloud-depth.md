# Review: A17-G Far Cloud Depth Continuity

## Metadata

- Type: `review`; status: `approved; owner accepted`; date: `2026-09-11`
- Author: Architecture Agent; target: working tree after A16 `93540ca075`
- Parent: [extension plan](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Phase: [A17 plan](../plans/2026-09-11-phase-a17g-far-cloud-depth.md)
- Diagnosis: [far bands](../discussions/2026-09-11-far-cloud-bands.md)
- Decisions: ADR-0043 / ADR-0048; upstream-owned changes and new SGP: none

## Acceptance items

- A17-AR-001 / high / fixed / Execution, confirmed by Architecture: the three
  Globe consumers now use native precise raw-depth overloads. The actual-GPU
  fixture verifies product producer/resolve depth blocks, final cloud
  composition, foreground rejection and Orthographic linear behavior. Its old
  aerial-expression mutation restores missing far-cloud pixels.
- A17-AR-002 / medium / fixed / Architecture with owner: the owner confirms
  “通过” on 2026-09-11 after the corrected-build visual handoff. Architecture
  closes the gate with the recorded passing regressions and bounded cost.
  Owner acceptance is distinct from the isolated reproduction; no independent
  reviewer is claimed.

## Final source review

Executable scope is three SceneGIS-owned GLSL files and the existing Spec:
SceneGISEnvironmentEffectsCloudFS, SceneGISEnvironmentEffectsCloudResolveFS and
SceneGISEnvironmentEffectsAerialFS. No model/shadow-control, Planar branch,
sampling budget, history rule, receiver tolerance, command or resource change.
The raw sample is decoded by Cesium's existing `(vec2, float)` overload with
native LOG_DEPTH_READ_ONLY selection; no custom formula or double decode.
The unused legacy resolved-depth value in CloudFS/ResolveFS remains for the
unchanged Planar branch and is dead code in the Globe shader.

All three source paths are absent from the official Cesium baseline and are
SceneGIS-owned. Upstream-owned changes, generated changes and SGP changes are
zero. Architecture reviewed this correction in the current task; no separate
independent review agent is claimed.

## Scoped verification — 2026-09-11

Commands use `npm run test -- --includeName "..." --failTaskOnError` on actual
Chrome 152 / Windows GPU-backed Karma:

- `preserves far Globe cloud depth and continuous coverage with a small near plane`:
  **1/1 pass**, 41.548 s. A 0.1 m near plane, 180–372 km continuous receiver and
  cloud layer test production depth blocks plus final composition. Perspective
  log depth and Orthographic linear depth preserve distance within the stated
  binary16 diagnostic-output tolerance. Deliberate foreground remains opaque;
  the former aerial expression loses more than one row's worth of cloud pixels.
- `renders every far opaque Globe pixel through linear and log aerial variants`:
  **1/1 pass**, 25.431 s. Retains actual native opaque geometry, aerial/fog
  behavior, clear-depth and stale-depth ownership checks.
- Spec ESLint and scoped supported-file formatting: pass. Required AgentDocs
  markdownlint passes. Required full AgentDocs Prettier reports the same 16
  unrelated existing files; all changed records are formatted.
- Normal test builds regenerate GLSL modules and bundles. No public API/build
  change requires a fresh full type/package/release matrix. Prior resource
  lifecycle evidence is reused because allocation/ownership code is unchanged.

The first new fixture omitted the low-distance sampler required by the resolve
prefix's textureSize call. Binding its explicit fixture texture fixes the
fixture; product source did not change in response. Initial Spec lint also
required immutable per-iteration frustum captures. No runtime fallback, retry
or settling-frame branch was introduced.

## Native reproduction and bounded cost

The isolated reproduction uses a 200 km camera at (-74.1°, 40.55°), heading 0,
pitch -0.85 radians, a paused 2026-06-21T17:00:00Z clock, mixed clouds and a tiny
native near receiver. The original reproduction used World Terrain. A later
direct online terrain request failed during diagnostic setup; the final
corrected-source observation uses the default ellipsoid at the same camera
and small-near condition. Both high and medium now show continuous cloud
coverage without the broad horizontal empty bands; page render errors are zero.
This is a reproduction, not the unavailable original owner camera.

Twelve paired GPU queries compare the old and current final aerial composite
against the same live high cloud/depth inputs, alternating order at 1600x900.
Median cost is **0.303616 -> 0.325120 ms** (+0.021504 ms); means are 0.303360 /
0.387072 ms, with current maximum 0.871424 ms. No disjoint event occurs. This
measures only final composition on ANGLE D3D11 / NVIDIA RTX 3060 Ti, not total
cloud marching, whole-page FPS or sustained performance.

An initial timing attempt at postRender found the renderer's borrowed texture
bindings already cleared. The valid measurement runs within the existing
native aerial command's resource lifetime using a temporary instance wrapper;
no prototype or product source is patched. The original instance method,
temporary programs/framebuffer/texture, queries and listener are restored or
released in finally. Near geometry and the isolated scene are removed after
verification. No diagnostic resource or browser setting is delivered as code.

## Project-owner acceptance — 2026-09-11

The owner explicitly confirms “通过” after the request to inspect the corrected
far view. Architecture accepts the bounded far-cloud correction and closes
A17-AR-002 and A17. All A17 findings are fixed. Existing GPU, source review and
performance evidence is reused without another browser/GPU run; this is not
an all-view or sustained frame-rate guarantee. The known 16 unrelated AgentDocs
format failures remain outside this correction.

The commit containing this acceptance record is the independent local A17
checkpoint after A16 `93540ca075`. It includes the three SceneGIS-owned shader
corrections, the Spec and formal/collaboration records; upstream-owned files,
generated files and SGP changes are zero. No push, successor activation or
additional quality tuning accompanies closure. P1 remains deferred.
