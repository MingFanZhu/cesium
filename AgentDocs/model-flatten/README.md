# Model flatten

## Metadata

- Extension slug: `model-flatten`
- Status: active
- Planning model: standalone
- Active plan: [first version](plans/2026-10-20-flatten.md)
- Current phase: engineering complete; owner visual acceptance pending
- Active phase plan: none; standalone plan
- Open discussions: none
- Architecture / execution: current task, no independent agent
- Updated: 2026-10-20

## Scope and engineering links

Static mesh 3D Tiles local vertex flattening in globe and planar worlds.
No topology splitting, source mutation or SDK integration before visual approval.

- Source: `packages/engine/Source/SceneGIS/Scene/SceneGISModelFlatten.js`
- Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGISModelFlattenSpec.js`
- E2E: `Specs/e2e/scenegis-model-flatten.spec.js`
- Example: `Test/模型压平.html`
- Sandcastle: none; manual inspection uses the Test example
- Branch: `feature/model-flatten`
- ADR: [0175](../../Documentation/SceneGIS/Decisions/ADR-0175-model-flatten.md)
- SGP: `SGP-0064`
- Review: [first version qualification](reviews/2026-10-20-review.md)

## Current handoff

Implementation and self-review complete. Owner visual acceptance pending; do not
integrate with the SDK conversation yet. The example supports globe/planar worlds,
real local photogrammetry and deterministic grids, concave outlines/direct holes,
height changes, enable/disable, and native LOD.

Qualification: 80 focused Specs, four development and four release GPU scenarios,
full development/release builds, generated types and TypeScript checks passed.
The review records inherited failures found when widening the native test filter.

Known boundary: cross-boundary triangles are deformed without splitting. Globe
target Z is an ENU horizontal plane, not a constant ellipsoid-height surface.
