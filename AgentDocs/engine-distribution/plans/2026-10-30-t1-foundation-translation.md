# T1 Foundation API translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only implementation
- Parent: [distribution program](2026-10-29-extension.md)
- Prerequisite: common-API checkpoint `20a9fcac91`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Source facts and scope

Native inventory contains 15,294 fields, 4,287 translated and 11,007 missing. Graph discovery
lacks current translation helpers, so the already inspected owned inventory/catalog path is
used. T1 completes 2,107 missing fields (1,358 distinct source texts) across 20 roots:
Cartesian2/3/4, Cartographic, Rectangle, Ellipsoid, Matrix2/3/4, Quaternion, HeadingPitchRoll,
Transforms, Color, BoundingSphere, BoundingRectangle, OrientedBoundingBox, Ray, Plane,
IntersectionTests and module:Math.

## Implementation and verification

1. Group exact source texts and preserve each ID/selector/hash. Reuse only unambiguous exact
   existing translations. Review all new prose, including precision, radians/degrees, matrix
   storage order, coordinate transforms, intersections and reference-frame conventions.
2. Maintain ordinary language catalogs; authoring templates may express reviewed repeated
   sentences but do not introduce fuzzy matching or a runtime translation mechanism. Numeric
   and formula-only descriptions retain their exact content.
3. Validate protected markup/links/code, rebuild docs, verify zero missing for selected roots,
   preserve signatures/examples/URLs, and inspect representative math pages. Add a narrow
   complete-root/semantic acceptance test; reuse existing translator and full-link tests.
4. Run docs-only and focused browser checks, scoped formatting/lint and AgentDocs checks.
   No runtime, source-comment, type or SDK edit; no full GPU/build matrix is justified.
5. Review and commit T1 before inspecting and activating T2.

## Risks

Do not confuse row-major constructor inputs with column-major storage, degrees with radians,
point transforms with vector transforms, or squared epsilon with componentwise tolerance.
Prose typos may be clarified only after checking current code and recording the evidence.
The rest of the native inventory remains reported until subsequent phases complete.

## Outcome and gate

Added all 2,107 missing records in four foundation catalogs. All 2,858 fields of the 20 roots
are covered. Native totals are 6,394/15,294 translated (41.8%), 8,900 missing and zero stale/unused.
Authoring reuses exact reviewed matrix/color templates; language-neutral formulas and numeric
constants retain their original text. No generator, runtime, upstream source or SDK changes.

Verified editorial clarifications include min/max random colors, volume versus radius, box corner
parameters, signed 2D cross product, latitude's inclusive upper clamp, quaternion inverse input
and the default ENU heading convention. Code/markup remain verbatim, including existing malformed
code tags. Docs build and 23 Node checks pass; focused foundation browser case and screenshot
inspection pass. All non-prose metadata, examples and URLs remain unchanged.
[Review](../reviews/2026-10-30-t1-foundation-translation.md) approves a local checkpoint before T2.
