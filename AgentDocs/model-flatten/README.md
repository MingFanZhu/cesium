# Model flatten

## Metadata

- Extension slug: `model-flatten`
- Status: active
- Planning model: standalone
- Active plan: [inverse flattening](plans/2026-10-22-inverse.md)
- Current phase: inverse engineering complete; owner visual acceptance pending
- Active phase plan: none; standalone plan
- Open discussions: none
- Architecture / execution: current task, no independent agent
- Updated: 2026-10-22

## Scope and engineering links

Static mesh 3D Tiles local vertex flattening in globe and planar worlds.
No topology splitting, source mutation or SDK integration before visual approval.

- Source: `packages/engine/Source/SceneGIS/Scene/SceneGISModelFlatten.js`
- Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGISModelFlattenSpec.js`
- E2E: `Specs/e2e/scenegis-model-flatten.spec.js`
- Example: `Test/模型压平.html`
- Sandcastle: none; manual inspection uses the Test example
- Branch: `scenegis/develop`
- ADR: [0175](../../Documentation/SceneGIS/Decisions/ADR-0175-model-flatten.md)
- SGP: `SGP-0064`
- Review: [inverse qualification](reviews/2026-10-22-inverse.md),
  [first version qualification](reviews/2026-10-20-review.md)

## Current handoff

Inverse implementation and self-review complete. `inverse` defaults false and can
be toggled without replacing shader/texture. True preserves the selected polygon,
flattening its exterior and holes to the existing target height. Tile/draw bounds
include displaced exterior content; normal mode and disabling restore the proper
bounds. The example supports both worlds and retains the mode on range changes.

Current qualification: nine owned Specs, four development and four release GPU
scenarios, full builds/types, scoped lint and patch audit pass. Global AgentDocs
markdownlint passes; global formatting reports inherited issues outside this
extension. The latest review records the precise scope and bounded cost evidence.

Owner visual acceptance remains pending; do not integrate with the SDK conversation
yet. Earlier qualification and accepted boundary finding F5 remain recorded in the
[first plan](plans/2026-10-20-flatten.md) and original review.

Known boundary: cross-boundary triangles are deformed without splitting. Globe
target Z is an ENU horizontal plane, not a constant ellipsoid-height surface.
Inverse mode expands bounds for all tiles and can increase selected content.
