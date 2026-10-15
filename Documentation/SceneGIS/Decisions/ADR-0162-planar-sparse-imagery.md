# ADR-0162: Planar sparse imagery on a canonical grid

- Status: Accepted
- Date: 2026-10-15
- Supersedes: ADR-0005 minimum-level/bootstrap restrictions and ADR-0082 complete-pyramid restrictions
- Related: [confirmed requirements](../../../AgentDocs/planar-world/discussions/2026-10-15-sparse-imagery-confirmed-contract.md)
- Implementation: [standalone plan](../../../AgentDocs/planar-world/plans/2026-10-15-sparse-imagery.md)
- Upstream-owned files / SGP: None

## Decision

Planar imagery providers declare a continuous canonical minimumLevel..maximumLevel,
with minimumLevel defaulting to zero. An optional read-only coverageExtent uses
SceneGISPlanarExtent in the world's projected meter coordinates. Coverage does not
change the world, origin, resolution, XYZ address or tilingScheme identity.

Use the actual rendered surface tile after terrain ancestor-cover resolution.
Below minimumLevel or outside coverage, create no imagery dependency and contribute
transparent color. Otherwise request its same-level address, capped at maximumLevel.
Children may sample ancestors; parents never sample or assemble finer children.
Geometry LOD remains independent. SingleTile retains its whole-world Level 0 contract.

Select the nearest cached READY ancestor within the declared interval. Bootstrap,
when needed, requests only the corresponding minimumLevel ancestor. No extra
intermediate ancestor sweep is introduced. Each binding retains at most one desired
and one fallback. A missing ancestor does not invalidate its children.

Request intersecting canonical tiles in full. A per-layer surface UV rectangle masks
the contribution outside coverage, preserving other layers and geometry. It adds one
vec4 uniform per layer, no sampler, texture allocation, draw or shader permutation.
Normal render publishes the mask with existing slot state; auxiliary passes replay it.

## Missing data and lifecycle

An image request rejection with explicit statusCode=404 is terminal UNAVAILABLE.
It neither raises the ordinary errorEvent nor retries. Unavailable entries share the
existing bounded tile/cache and source-generation lifetime. Generic browser errors,
401/403, 5xx, decode and dimension failures retain the ordinary error/retry channel.
Synchronous undefined still means throttling. Transparent images remain valid READY
data. Metadata XML failures, including 404, still reject provider initialization.

A missing desired tile may retain a READY ancestor or finish a useful pending
bootstrap. tilesLoaded means the current view has settled: that pending work still
counts, but excluded and terminal missing bindings do not block readiness. Existing
cancellation, late-result isolation and exactly-once release remain authoritative.

## Protocols

URL and WMS retain global addresses and complete canonical BBOX values. WMTS matrix
labels are indexed by canonical level, and only the declared interval requires labels.
TMS metadata resolutions determine the canonical starting level; consecutive TileSets
must halve resolution without rebasing XYZ. Service order/href remain service identifiers.
Origin stays global southwest, while BoundingBox may declare a rectangular coverage.
Explicit SDK coverage and min/max must fit metadata; absent overrides use metadata.
Conflicts fail initialization rather than silently expanding or renumbering data.

## Consequences and verification

Sources without coarse images disappear when actual surface tiles become too coarse.
No overview, mosaic, forced refinement, camera threshold or reverse sampling is added.
Specs verify address invariance, interval validation, coverage pixels, missing/error
classification, readiness and lifecycle. A deterministic local page supports the
owner's final visual acceptance. Public API changes require full build and type checks.
