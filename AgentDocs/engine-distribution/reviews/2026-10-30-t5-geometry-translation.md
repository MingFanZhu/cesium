# T5 Geometry translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T5](../plans/2026-10-30-t5-geometry-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and resolved findings

Five catalogs add 1,547 records, completing 2,081 fields of 95 geometry/numerical roots.
Reviewed all 34 exact reused texts. Units, winding, bit widths, storage/pack offsets, spline
parameter time, derivative orders, local/world coordinates, projection and visibility contracts
remain explicit. Protected examples, formulas, HTML, links and signature metadata are unchanged.

Current-code evidence resolves source prose errors:

- BoxGeometry/BoxOutlineGeometry retain arbitrary min/max corners; the constructor need not be
  an origin-centred cube. fromDimensions retains its actual origin-centred behavior.
  CylinderOutlineGeometry.createGeometry accepts either radius at zero, but rejects negatives
  and two zero radii. Chinese states nonnegative radii and keeps inherited exception-tag structure.
- GeometryPipeline.encodeAttribute keeps the source componentsPerAttribute in both Float32
  attributes. Encoded positions are not universally four-component values. Color storage follows
  each attribute datatype; ColorGeometryInstanceAttribute uses UNSIGNED_BYTE. Geometry vertex
  count compares values.length divided by componentsPerAttribute, not raw array lengths.
- EllipsoidRhumbLine checks distance of the geocentric angular separation from PI, at least
  0.0125 radians. The limit excludes near-antipodal points rather than nearby points.
- Camera.offsetFromHeadingPitchRange uses a north-to-east look heading and positive pitch below
  the local plane. HeadingPitchRange prose now states its actual camera-use convention, matching
  existing Camera lookAt documentation rather than the copied east/above wording.
- Hermite createC1 shares incoming/outgoing tangents at each knot, not one identical tangent for
  every control point. QuaternionSpline uses separate fastSlerp segments and cannot generally
  guarantee C1 continuity at knots. OrderZero interpolation omits derivative data; it does not
  force a constant polynomial. Ground polyline sampling uses metres, other geometric sampling
  uses its documented angular units; curve parameter times are independent of the scene clock.
- RectangleGeometryLibrary uses Matrix2.fromRotation with the supplied angle. Rectangle updater
  forwards rotation unchanged; both prior RectangleGraphics records now say counterclockwise.
  Frustum pixel dimensions use a distance parameter, not a distance to the near plane.
- Occluder.computeOccludeePoint returns a Cartesian3 or undefined, not an object to destructure.
  Existing protected occludeePoint/valid tokens are retained in a clarifying sentence. Minor
  copied labels (Stereographic latitude, distance-attribute enabled flag) are corrected in prose.

Accepted inherited formatting/identity limitations: malformed IndexDatatype/VertexFormat code
markup and the PolygonOutline LinkType target remain literal, like the earlier source metadata
issues. Canonical IDs and protected link/code targets are not rewritten in an editorial catalog.
No new broken metadata URL/anchor or runtime behavior is introduced.

## Validation and gate

- Docs build passes: 12,671/15,294 translated (82.8%), 2,623 missing, zero stale/unused.
- Twenty-seven Node checks pass, including all 364 reviewed roots, geometric semantics, every
  metadata page/anchor, provenance and protected-token/hash safety.
- Focused nested browser case passes with zero page/resource errors. Screenshot inspected at
  Geometry.attributes: Chinese storage/layout explanations and the unchanged diagrams/code render.
  CatmullRomSpline explicitly displays unitless parameter time independent of the clock.
- Before/after comparison preserves all 7,943 symbols' non-prose metadata, signatures, example
  bodies and URLs. No source, generator, public signature or SDK edit; runtime/type/GPU rebuilds
  are outside this editorial batch's risk boundary.
- Scoped ESLint/Prettier and Markdown checks pass; whole-tree AgentDocs formatting retains only
  inherited warnings outside this extension. No generated artifact or upstream file committed.

No unresolved new implementation finding. Approved for the T5 local checkpoint. Inspect current
remaining source inventory before the next phase; the full translation goal remains active.
