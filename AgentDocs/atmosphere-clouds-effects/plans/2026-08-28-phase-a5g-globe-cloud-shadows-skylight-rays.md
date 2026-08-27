# Phase Plan: A5-G Globe Cloud Shadows, Skylight, and Crepuscular Rays

## Metadata

- Plan type: `phase`
- Status: `active; implementation assigned`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-27-phase-a4g-globe-integrated-cloud-core.md](2026-08-27-phase-a4g-globe-integrated-cloud-core.md)
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-28`
- Updated: `2026-08-28`
- Branch: `feature/atmosphere-clouds-effects`
- Predecessor checkpoint: A4-G=`241de41fc36835114a4e9312ad53ca2ac64407b8`
- Architecture decision:
  [ADR-0047](../../../Documentation/SceneGIS/Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md)
- Source discovery:
  [A5-G shadow/skylight/rays source discovery](../discussions/2026-08-28-a5g-shadow-skylight-rays-source-discovery.md)
- Upstream patches: active `SGP-0008` (`consume only`), proposed `SGP-0009`
- Open review finding: none; initial implementation pending
- Owner visual gate: not requested

## Goal

Add the first physically connected Globe lighting slice above A4-G: a bounded
Beer optical-depth atlas, direct cloud shadows on the Cesium Globe surface,
Bruneton Sun/sky irradiance for that approved surface consumer, and equivalent
cloud shadow length shared by atmosphere, clouds and directional height fog.

The result must remain in the existing SceneGIS HDR graph, preserve Cesium
lighting for Models/3D Tiles, and introduce no Planar behavior.

## Frozen predecessor

- A4-G density, reference coordinates, macro/LOD scales, preset/material assets,
  lighting transport, `cloudRadianceScale=48`, occupancy hierarchy, log-depth,
  resolve/history owner and accepted visual result are frozen except where the
  new shadow-length semantic must explicitly pass through the existing distance
  alpha.
- A2 LUTs, Sun authority and A3 composition order remain the only atmosphere/fog
  radiometric sources.
- `SGP-0008` render slots remain consume-only.
- Planar product shaders, calibration, controls, tests and owner gate are frozen.

## Deliverables

### 1. Public controller contract

Add `showCloudShadows=true` and `showCrepuscularRays=true` constructor options,
JSDoc and writable properties. Use the existing validation, request-render,
history invalidation and package-export patterns. Do not add `showSkylight` or a
new public calibration scalar.

Advanced Globe surface Sun+sky lighting is inherent while the controller is
enabled and ready. Cloud shadow/ray options only gate the cloud coupling;
`showClouds=false` makes both contributions identity. Controller-disabled output
and resource state remain exact Cesium identity.

### 2. Current-frame Beer shadow atlas

Implement a SceneGIS-owned cascade builder and renderer, preferably as a small
private owner plus shared Globe shader helpers rather than expanding the main
renderer monolith.

- one RGBA16F atlas/FBO/program, no depth or history;
- low 2×256, medium 3×256, high 3×512 in a 2×2 atlas;
- atlas bytes are exactly 2,097,152 for low/medium and 8,388,608 for high;
- practical split lambda 0.5, maximum distance 200 km, Perspective and
  Orthographic frustum corners, local-ENU light bounds and texel snapping;
- 25/50/50 shadow steps through one maximum-50 program;
- at most one tile command per active cascade, issued before its same-frame
  consumers in the existing background slot;
- exact A4-G Globe density/material/time/preset/assets and geodetic-normal anchor;
- reference RGBA channel topology and Beer ground decode from ADR-0047.

Candidate creation/quality resize must be failure-atomic. Use public Cesium
Context abstractions only; no native `ShadowMap`, raw `_gl`, PBO, runtime fetch,
jitter or temporal BSM.

### 3. Minimal Globe surface seam (`SGP-0009`)

Create the SGP manifest entry and paired markers only in:

- `packages/engine/Source/Scene/GlobeSurfaceShaderSet.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`
- `packages/engine/Source/Shaders/GlobeFS.glsl`

The renderer publishes an explicit active/inactive frame-local lighting record
during pipeline update, before Globe surface command construction, and marks it
active only after candidate resources are ready. Atlas commands execute later in
the advanced background slot; surface uniform callbacks then read that same
frame's completed atlas. ShaderSet adds variant bit `0x400000000` after the existing highest bit and
injects SceneGIS-owned Bruneton/surface helper source only for that variant.
TileProvider adds only uniform callbacks.
GlobeFS adds one mutually exclusive branch at the existing final lighting
selection. `GlobeVS.glsl` must remain unchanged.

Use terrain normals when the current mesh provides them and geodetic normals
otherwise. Evaluate `albedo / PI * (direct Sun * cloud T + sky irradiance)` with
the same A2 LUT/Sun authority and A4 local-ENU virtual-sphere mapping. Require
native `globe.enableLighting=false` before any A5 mutation. Do not relight
resolved color, Models or 3D Tiles and do not take ownership of `scene.light`.

### 4. Shadow-length transport and crepuscular coupling

During the existing low-resolution Cloud pass, march the BSM along every
relevant view segment and accumulate the ADR-0047 equivalent shadow length.
Reuse distance alpha with the exact half-float encoding:

```text
code = round(clamp(length / 200000, 0, 1) * 1023)
packed = valid ? 1 - code / 2048 : code / 2048
```

Decode each sample before existing spatial/temporal selection, filter validity
and length semantically, then repack. Reuse the current cloud-history reset when
the encoding mode or BSM authority changes. Do not add a third MRT or new history.

Feed decoded length to Globe finite-geometry/cloud/clear-sky Bruneton
`GetSkyRadianceToPoint`. Apply it only to A3 fog directional Sun inscatter;
ambient/sky fog remains. Length zero must preserve the accepted A4-G visible
composite and exact old alpha `0/1` encoding.

### 5. Direct Test and records

Extend `Test/高级环境.html` with Globe-only shadow and rays toggles plus a small
fixed capture set. One explicit owner state gets one same-frame capture. Report
the existing finite/storage summaries and show final screenshots; do not add
hashes, replays, convergence loops or cross-world matrices.

Update this plan, the extension index and an A5-G review record with actual
implementation deviations, resource counts, upstream-owned paths/SGP and
focused validation results.

## Expected SceneGIS-owned paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- optional new private cascade owner under the same `_private/` directory
- new/shared shaders under
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- existing Cloud/Aerial/Fog/Bruneton shaders only where shadow transport enters
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/高级环境.html`
- `scripts/scenegis/verify-planar-packages.mjs` for public default/package shape
- current A5-G AgentDocs and ADR execution writeback

Generated shader modules and package barrels must be produced by the repository
generator and must not be hand-edited.

## Minimal sufficient validation

Run only these bounded checks unless implementation evidence exposes a concrete
failure outside them:

1. focused public contract, disabled identity, conflict and lifecycle Specs;
2. one actual-GPU BSM fixture for known optical depth, surface transmittance and
   cascade overlap continuity;
3. one packed-alpha/crepuscular fixture for exact round-trip, zero identity and
   directional-only attenuation;
4. one focused Globe surface program fixture for variant off/on and normal path;
5. existing `SceneGISEnvironmentEffects` controller and A1 private pipeline;
6. focused upstream Globe surface Specs affected by `SGP-0009`;
7. installed/package verifier, changed-scope lint/format/Markdown/patch audit and
   `git diff --check`;
8. a small Globe browser set: high-Sun ground/oblique shadow off/on, low-Sun rays
   off/on, combined, and no-moon night.

Do not run the full repository, Scene aggregate, unrelated generator/type/build
matrices, Planar qualification or synthetic hash/replay gates by default.

## Acceptance

- Surface cloud shadows follow the same A4 cloud deck, remain continuous across
  cascade overlap and do not suppress sky irradiance.
- Globe ground/terrain receives coherent A2 Sun+sky lighting with native Globe
  lighting conflict rejected before mutation.
- Low-Sun atmosphere/cloud/fog shows physical shaft separation when enabled and
  returns to length-zero identity when disabled.
- No extra haze, radial blur, generic scene relighting, third MRT, second history,
  raw WebGL path or Planar behavior is introduced.
- All resources meet the fixed budget and destroy/resize/request-render semantics.
- Architecture review and project-owner Globe visual gate pass before the A5-G
  checkpoint or any A6-G activation.

## Handoff

Execution implements only this converged boundary, records deviations before
expanding scope, and returns `review_ready` without committing, pushing,
requesting the owner gate or entering A6-G. Architecture performs independent
review and creates the phase checkpoint after technical and owner acceptance.
