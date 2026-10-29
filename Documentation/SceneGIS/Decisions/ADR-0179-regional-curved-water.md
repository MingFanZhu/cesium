# ADR-0179: Regional ellipsoid water with shared FFT

- Date: 2026-10-21; status: accepted, implemented; owner visual gate pending
- Phase: [R25](../../../AgentDocs/rendering-quality/plans/2026-10-21-r25-curved-water.md)
- Existing integration: ADR-0087 / SGP-0017, unchanged

## Decision

Extend SceneGISWaterSurface with explicit `geometryMode: "ellipsoid"`. Default `"local"`
retains local XY / rigid modelMatrix semantics and normal-only or FFT waves. Curved mode
requires SceneGISWindWaves, identity modelMatrix, and an ECEF PolygonHierarchy. Constant
`height` is ellipsoid height; `perPositionHeight` instead preserves source vertex heights
and interpolates the prepared regional triangles. Neither mode queries terrain.

Use a fixed gnomonic chart of geodetic normals centered on the outer ring. All rings must
lie in its open tangent hemisphere; polygons are simple rings with straight chart edges.
This avoids longitude wrapping and polar longitude singularities. The inverse chart maps
to the exact ellipsoid, followed by geodetic height. FFT uses this stable meter chart with
the origin's east/north orientation; regional projection distortion is explicit, not a
global ocean model. Ordinary local water and native Fabric Water remain unchanged.

A private quadtree clips original triangle coverage, selects view-dependent cell sizes
and curvature accuracy, and generates relative-to-tile geometry. Adjacent grid boundaries
are explicitly conformed, retaining shoreline/holes and interpolated heights. Selection
has a caller-visible tile ceiling; inactive GPU storage and CPU branches are bounded.
FFT simulation is shared across all selected commands and remains caller-owned.

Curved base normals/tangents feed the existing optics. Bottom/refraction/reflection tests
use a camera-relative local osculating-sphere approximation to the curved mean interface
instead of a single local plane. This bounds cancellation in contact-depth calculations;
it does not claim exact global refraction or exact ellipsoid signed distance. Preserve the existing
Scene-owned opaque capture, scheduling, depth/pick passes, sky and physical-light inputs.
No new upstream seam, framebuffer or full-screen pass is added.

## Alternatives and qualification

One enormous ENU plane does not follow curvature. Eagerly materializing 128 m tiles makes
construction/traversal scale with area. Independent FFT per tile wastes simulation work
and breaks phase continuity. Removing ordinary water would break a useful inexpensive
path while doing little to simplify curved geometry.

This phase qualifies regional rivers/lakes, above-water and one non-overlapping layer.
No global sea mask, geoid conversion, swell cascade, fluid transport, tides, breaking waves
or underwater medium. Focused CPU/GPU tests, both-world regressions, a deterministic large
example, bounded construction/runtime measurements and release/types precede delivery.

All added implementation and GLSL use existing SceneGIS-owned roots and build discovery.
No generated file is committed. SGP-0017 is reused without modification.

## Subsequent underwater qualification

[ADR-0199](ADR-0199-globe-underwater.md) adds finite underwater viewing for
constant-height regional water through the existing `underwaterDepth` option.
The above-water qualification of R25 is retained as historical scope; variable
levels, RiverSurface volumes and curved bathymetry/caustics remain excluded.
