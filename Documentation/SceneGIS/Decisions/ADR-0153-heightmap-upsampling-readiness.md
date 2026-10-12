# ADR-0153: Native heightmap upsampling readiness

- Status: accepted maintenance backport
- Date: 2026-10-12
- Owner: current architecture task; owner authorized shared WebGL fixes
- Patch: SGP-0043
- Plan: [WebGL backport](../../../AgentDocs/rendering-quality/plans/2026-10-12-webgl-fix-backport.md)
- Provenance: `ec5f98014c`, original SGP-0043 under the WebGPU automatic-coverage work

## Decision and evidence

Native `GlobeSurfaceTile.processTerrainStateMachine` advances a failed child's parent
when `terrainData.canUpsample === false`. Heightmap upsampling requires `_mesh`, but
HeightmapTerrainData previously omitted the readiness property. A received ancestor
could therefore be treated as ready while its missing descendants repeatedly returned
undefined from upsampling. Scheduling only those descendants never advanced the parent.

Expose `canUpsample` as `defined(this._mesh)`, following the native QuantizedMesh contract.
Reuse the native state machine; add no scheduler, retry, backend dependency or geometry
copy. The property reports internal readiness and does not change loading entry points.
Keep SGP-0043's identity when backporting; do not import the GI implementation or its ADRs.

## Verification and upgrade condition

The owned SceneGISHeightmapUpsamplingSpec starts a received heightmap ancestor, schedules
only a missing grandchild, and requires completion with the original interpolated height.
Run affected native HeightmapTerrainData and GlobeSurfaceTile regressions. Retire this seam
when the upstream heightmap type reports equivalent readiness before native upsampling.
