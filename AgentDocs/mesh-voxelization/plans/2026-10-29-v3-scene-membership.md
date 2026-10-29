# V3: Nested native tileset Scene membership

- Type: phase; status: completed; 2026-10-29.
- Parent: [roadmap](2026-10-28-extension.md); owner/reviewer: current engine task, self-review.
- Architecture review: confirmed; ADR-0198; existing SGP-0072 unchanged.

## Source facts and design

Constructor/update use direct PrimitiveCollection.contains. Replace them with an
iterative traversal of the supplied Scene's native PrimitiveCollection graph,
using public length/get/contains and reference identity. Only native
Cesium3DTileset is accepted. No SDK dependency, private collection arrays,
reparenting, duplicate attachment or ownership mutation. Recheck reachability
until the snapshot is handed to the independent Worker; source removal after
that boundary remains allowed. Existing frame context, source transform,
content snapshot and source-precision validation are retained.

## Validation and gate

Real offscreen loader tests exercise top-level and nested sources, Globe/Planar,
cross-Scene/unmounted inputs, removal of the source or an ancestor, destruction,
static placement and ownership. Existing adapter tests protect active regional
loading and camera-independent snapshots. Update SDK guide/example and ADR;
scoped tests/lint plus build/types, review and a separate local checkpoint before
activating the independent wind-history phase.

Completed: 19 strict adapter Specs, full build, generated types and tsc pass.
[Review](../reviews/2026-10-29-v3-scene-membership.md) confirms the phase gate.
