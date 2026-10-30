# T3 Rendering and visual primitives translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T2 checkpoint `a64c5afc0f`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

The rebuilt current inventory contains 7,201 missing native fields. Select 80 rendering roots
with 1,560 missing fields and 1,219 distinct source texts. Scope includes Model/animation/feature,
billboards/labels/points/polylines, appearances/materials, classification/ground lines, clipping,
postprocessing/custom shaders, atmosphere/sky/fog/lights/shadows/environment maps, point clouds,
particles/emitters/clouds and associated rendering enums/distance controls. The explicit root
list in the acceptance test defines the reviewed batch. Data/property/geometry and remaining
native APIs stay visible in the report for subsequent phases.

## Implementation and gate

1. Author exact source-bound prose catalogs, reviewing any reused text in context. Preserve
   HTML attributes, literal code, example bodies, URLs, types, signatures and native identity.
2. Retain GPU resource ownership, update/destroy restrictions, WebGL capability requirements,
   coordinate spaces, pixel/metre/radian units, alpha/depth behavior, shader input/output
   contracts, clipping operations and performance caveats. Check source when prose is ambiguous.
3. Rebuild docs; assert all selected roots covered, zero stale/unused, unchanged semantic
   metadata/code/links. Add focused rendering-contract assertions and inspect representative
   Chinese output using one narrow browser case. Reuse complete metadata/anchor checks.
4. Review, lint/format, update extension handoff and create the local phase checkpoint before
   elaborating subsequent data/geometry or remainder phases. Do not alter runtime or generators.

## Risks

Do not translate pixel sizing into metres, texture ownership into automatic cleanup, straight
alpha into premultiplied alpha, union into intersection, or eye coordinates into world coordinates.
Do not promise unsupported physical accuracy or platform capabilities. Source copy errors require
current-code evidence before Chinese clarification. Exact English text alone is insufficient for
context-sensitive reuse. The continuous goal remains active until every native gap is resolved.

## Outcome

Added 1,560 source-bound records across seven catalogs, completing all 1,713 fields of the
80 selected roots. Coverage is 9,653/15,294, leaving 5,641 missing with zero stale/unused.
Reviewed reused text in context and corrected verified prose errors without changing source,
identities, links or code. See the [approved review](../reviews/2026-10-30-t3-rendering-translation.md).
No runtime/generator/API deviation. Commit this phase before activating subsequent scope.
