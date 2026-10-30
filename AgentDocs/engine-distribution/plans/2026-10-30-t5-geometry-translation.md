# T5 Geometry and numerical API translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T4 checkpoint `e8224e7504`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

The current rebuilt report leaves 4,170 native fields missing. Select 95 geometry/numerical
roots with 1,547 missing fields and 990 distinct source texts: native geometry constructors
and outlines, attributes/instances/pipeline/formats, splines/interpolation/polynomials,
frustums/culling/occlusion, geodesics/rhumb lines/tangent projections, spherical coordinates,
packing/component/index types and associated geometric enums/helpers. GeoJSON/I3S geometry
representations are included. The acceptance test root list defines the concrete batch.
Other widgets/input, metadata/providers and utilities stay reported for subsequent phases.

## Implementation and gate

1. Translate exact current-source prose records, reviewing reused text in context. Preserve
   protected literal code, links/markup, example bodies, types, signatures and canonical IDs.
2. Preserve metre/radian/pixel units, winding/normal/orientation, angular versus Cartesian
   sampling, pack offsets and array storage, spline parameter domains, derivative requirements,
   projection conventions, frustum bounds and error/undefined-result semantics.
3. Rebuild docs; assert complete selected roots and zero stale/unused, compare every non-prose
   field/example/URL, add focused geometric-contract assertions and one browser inspection.
4. Lint/format, review and checkpoint before elaborating remaining scope. No source, generator,
   runtime, public signature or SDK changes.

## Risks

Do not confuse geodesics with rhumb lines, index count with byte count, radii with diameters,
clock with cone angles, packed order with constructor order, or extrapolation with clamping.
Keep formula-only prose language neutral and literal code untouched. Source prose corrections
require current-code evidence; inherited protected metadata identities/links remain intact.

## Outcome

Five catalogs add 1,547 records, completing 2,081 fields of the selected roots. Current coverage
is 12,671/15,294, with 2,623 missing and zero stale/unused. Verified corrections cover encoded
attribute components, radius/antipodal limits, camera angle conventions, piecewise slerp and
rectangle rotation. Two prior RectangleGraphics translations are corrected in this related
geometric audit. See the [approved review](../reviews/2026-10-30-t5-geometry-translation.md).
No runtime/source/generator deviation. Commit before elaborating remaining scope.
