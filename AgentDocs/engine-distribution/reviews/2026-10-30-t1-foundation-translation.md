# T1 Foundation translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T1](../plans/2026-10-30-t1-foundation-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and editorial evidence

All 2,858 fields across 20 foundation roots are covered by exact source-bound records, including
2,107 new fields. Numeric/formula-only descriptions are language neutral and preserved exactly.
Color swatches retain their hex values and HTML attributes. Matrix constructor/storage ordering,
point/vector w semantics, rigid/affine assumptions, angular units, normal signs and cache-array
length constraints remain explicit. Repeated templates exist only in ignored authoring scratch;
maintained catalogs are ordinary records without fuzzy matching or runtime changes.

Verified source typos are clarified only in Chinese:

- Color.fromRandom uses `minimum + random * (maximum - minimum)`; eight parameter descriptions
  reverse those names in English. Chinese follows the actual bounds.
- BoundingSphere.volume returns `(4/3) * PI * radius cubed`, not a radius. fromCornerPoints computes
  a midpoint/distance of two Cartesian3 corners, not rectangle heights.
- Cartesian2.cross returns `left.x * right.y - left.y * right.x`, a signed z component, not an
  unsigned magnitude. Quaternion.inverse uses conjugate divided by magnitude squared; its
  parameter describes the inverse input rather than normalization.
- Math.clampToLatitudeRange calls clamp with both +/-PI_OVER_TWO bounds; the upper endpoint is
  inclusive. Chinese corrects the prose's open bracket without changing protected code tokens.
- Transforms.headingPitchRollToFixedFrame delegates to Quaternion.fromHeadingPitchRoll and
  defaults to eastNorthUpToFixedFrame. Chinese expresses the default model heading as rotation
  about the negative local up axis, distinct from camera heading/pitch conventions.

Existing malformed code tags and literal examples remain unchanged rather than weakening the
translation protection contract. No upstream cleanup is bundled into this editorial phase.

## Evidence and gate

- Docs build passes: 6,394 translated, 8,900 missing, zero stale/unused.
- Twenty-three Node checks pass: 38 reviewed roots, complete anchors, metadata semantics,
  translation token/hash safety, ownership and source-language separation.
- Focused foundation browser case passes with no page/resource errors. Screenshot reviewed.
- Before/after comparison preserves every non-prose field, signature, example body and URL.
- Scoped ESLint/Prettier and Markdown checks pass. Whole-tree AgentDocs formatting has only
  inherited warnings outside this extension. Catalog-only scope does not justify runtime/type/GPU
  rebuilds. No SDK, generated artifact or upstream-owned file is included, so no SGP.

No unresolved new finding. The continuous target remains active with 8,900 native fields pending.
Approved for the T1 checkpoint; inspect current inventory before activating T2.
