# R34: Regional Globe underwater viewing

- Type: phase plan; status: completed (technical); owner visual gate pending; 2026-10-29.
- Owner / architecture reviewer: current engine task; source-based self-review confirmed.
- Parent: [rendering-quality roadmap](2026-09-18-rendering-quality-extension.md).
- Entry: R33 implementation checkpoints exist; its owner visual gate remains recorded independently.
- ADR: [0199](../../../Documentation/SceneGIS/Decisions/ADR-0199-globe-underwater.md).
- SGP: unchanged SGP-0017; only SceneGIS-owned implementation paths.

## Source facts and scope

Globe ENU local water already supports underwater viewing. The missing contract is
`SceneGISWaterSurface.geometryMode: "ellipsoid"`: validation rejects a positive
`underwaterDepth`, the volume expects local XY edges, and curved SSR rejects all
submerged reflected hits. The regional mesh already owns a fixed geodetic-normal
gnomonic chart and a copied polygon hierarchy. WaterFrame supports an immersed
camera even when surface commands are culled and resolves once at the nearest
frustum. No Scene/native hook or new full-resolution target is needed.

Extend the existing `underwaterDepth` option to constant-height regional ellipsoid
water, preserving concavity, nested holes and the 256-edge ceiling. CPU immersion
uses the configured ellipsoid's geodetic height and existing chart. GPU rays use
a camera-relative curved shell and projected chart edges; reuse R25's local
osculating-sphere optical approximation rather than an Earth-sized tangent plane.
Clip at the first top, bottom, shoreline/hole or opaque hit; orthographic ray
origins are checked independently. Keep underside Fresnel/TIR and select the
correct incident medium for curved SSR. Mean-height immersion and nonoverlapping
opaque-only water remain the contract. Varying per-position levels, RiverSurface,
curved bathymetry/caustics, global oceans and wave-exact menisci remain excluded
with explicit validation where applicable.

## Implementation and validation

1. Document the API extension and curvature approximation in ADR-0199 before implementation.
2. Extend the owned volume helper, shader and WaterSurface validation; preserve the local path.
3. Correct curved reflection medium acceptance without changing traversal budgets.
4. Add CPU/GPU regressions for geodetic immersion away from the chart center, date line/poles,
   holes, surface/cap/shore ray exits, down/up views, opaque occlusion, frozen rendering,
   pick behavior, runtime disable and resource release. Compare sphere rays with analytic roots.
5. Add curved-lake underwater controls and an authored curved bed; keep example logic to public API assembly.
6. Build, related water/optics/curved/SSR regressions, types/release, browser views and bounded GPU
   cost evidence. Review and independent local phase checkpoint precede further work.

## Risks and handoff

Regional gnomonic coordinates distort distances away from their origin. The same
camera-relative sphere approximation as R25 bounds local optical work but is not
exact global ray/ellipsoid or geoid transport. A finite depth is an authored cap,
not inferred terrain. Large input meshes retain the existing synchronous LOD
construction cost. Owner visual review remains the final picture-quality gate.

Implementation and [technical review](../reviews/2026-10-29-r34-globe-underwater.md)
are complete. Seventy-four development GPU cases, nine release cases and three
curved-water browser cases pass; build/release/types pass. The example's resolve
uses one 176-byte boundary texture and measured about 0.242 ms GPU at 1185 × 800
on RTX 3060 Ti. Local/river behavior and lifecycle regressions pass. No upstream
file, SDK or generated-file changes. Owner visual gate remains open; this phase's
independent local checkpoint contains implementation, tests, ADR and records.
