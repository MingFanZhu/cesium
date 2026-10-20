# ADR-0176: Directed observer viewshed

## Status

- Status: approved for phased implementation
- Date: 2026-10-21
- Owner: current task architecture self-review
- Related plan: [viewshed](../../../AgentDocs/viewshed/plans/2026-10-21-extension.md)
- Related patch: None in V1; later upstream seams registered before implementation

## Context

Native ShadowMap and the legacy Visible implementation draw commands gathered
for the main camera. Offscreen terrain and tiled content are therefore not a
complete observer occlusion set. Legacy fragment replacement also loses mask /
clipping semantics, and main-view-distance bias changes classification when the
display camera moves.

## Decision

Use a directed observer depth pass independent of solar shadows. Explicitly bind
the analysis to one Scene and World; Globe uses ECEF metres, Planar uses its
existing XYZ metres. Never implicitly project or reuse another World's resources.

Keep native geometry transformation and depth/discard derivation. Share decoded
content and GPU geometry, but select and protect tiles for the observer view.
Readiness must describe observer coverage rather than the main view's tilesLoaded.
Missing coverage is not evidence of visibility. Opaque and alpha-masked surfaces
are eligible; transparent media, annotations, classification overlays and helper
geometry are not occluders. Terrain skirts are excluded.

Reproject main-view surface depth into the observer depth map and composite
analysis colors in the display stage after exposure. Comparison bias belongs to
observer precision, not main-camera distance. Optional edge display filtering
must not become a probabilistic visibility claim.

The initial implementation updates on actual rendered frames for correctness
with animation, clipping, flatten and streaming. Any future cached-capture policy
requires complete invalidation evidence rather than a guessed settling delay.

V1 implements only the private depth foundation. V2 introduces independent
selection, explicit loading state and public integration. V3 qualifies the full
product in both worlds. No public API or complete support is claimed by V1.

## Ownership, cost and upgrade boundary

Owned helpers, native depth targets, ShaderCache-derived programs and borrowed
source resources retain separate lifetimes. Instances never cache state on
shared DrawCommands. Main camera, frame state, picking, terrain queries and light
shadows must be restored or kept separate. Observer traversal and extra draws
have explicit cost; missing main-view geometry is not silently accepted.

Use existing native pass APIs where suitable. Necessary Scene / terrain seams
remain minimal and tracked by SGP, rather than copying a second Cesium runtime.
The full first version excludes 360-degree coverage, observer union, result
export, exact area statistics and transparent volumetric transmission.

## Verification

GPU evidence must cover discard and original vertex transformations, offscreen
occluders, stream readiness, large coordinates, depth precision, independent
instances and destruction. Integration includes Globe / Planar terrain, native
model / 3D Tiles and S3M. Build and type checks accompany public API changes;
shader delivery follows ADR-0030. Final visual acceptance remains with the owner.
