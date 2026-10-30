# T9 Specialized API translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T9](../plans/2026-10-30-t9-specialized-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and resolved findings

Four catalogs add all 710 remaining records, completing all 778 fields of 66 specialized roots.
Reviewed 36 exact reused texts and all repeated contexts. All 606 reviewed roots are complete.
Preserve protected code, formulas, HTML, canonical links, signatures, types and example bodies.

Current-code evidence confirms or corrects the following:

- Buffer array views require setters to trigger render updates; material changes require another
  setMaterial call. Collections have fixed capacity and byteLength includes unused allocations.
  BufferPrimitiveCollection.sort returns old-index to new-index mapping, preserving feature IDs.
- BufferPrimitiveMaterial uses DataView getUint32/getUint8 with byte offsets. Correct the old
  view description plus new pack/unpack prose. Three prior type-only labels now include a Chinese
  type/object noun. No upstream source or public type declaration changes.
- VoxelCell.getOrientedBoundingBox decodes z by x*y slices and y by x rows: X changes fastest.
  Document inputDimensions including padding versus z-up dimensions excluding padding, pixel
  screen-space error, raymarch step multiplier, tile event timing and request throttling.
- Cesium3DTilePointFeature.labelOutlineWidth forwards to the label outline, not the point.
  PanoramaProvider supplies panorama imagery, not ellipsoid surface imagery. Keep I3S geoid
  orthometric-to-ellipsoidal conversion distinct. VoxelCell reused point-feature text is adapted
  to cell property names/values rather than blindly sharing that context.
- ConditionsExpression.evaluateColor returns undefined with no matching condition. Chinese
  description and return prose now say so; native Color return tag identity remains unchanged.
  Elevation band prose clarifies its misspelled protected extend-downwards literal.

Accepted inherited limits: malformed trailing paragraph tags, unqualified buffer member links,
and other native link/metadata identities remain literal. This phase does not rewrite native
JSDoc or introduce runtime corrections. Earlier phase reviews record related inherited issues.

## Validation and gate

- Docs build: 15,294/15,294 translated, missing/stale/unused all zero.
- Thirty-two Node checks pass, including zero gaps for every current native field, all 606
  roots, owned-source exclusion, semantic contracts and protected-token/source-hash behavior.
- Pure numeric/formula Math descriptions stay equal to their original source. Every other
  catalog field contains Chinese prose; no scratch placeholders remain. Doclets with no prose
  legitimately have no per-field i18n record. Update the earlier positive-gap integration test
  to the completed-coverage contract; unit fixtures still verify missing/stale fallback behavior.
- Focused nested browser case passes without page/resource errors. BufferPolygon shows required
  setter updates; inspected VoxelContent screenshot shows field arrays and X-fastest layout.
- All 7,943 symbols preserve non-prose metadata, signatures, executable examples and URLs.
- Scoped ESLint/Prettier and Markdown checks pass; whole-tree AgentDocs formatting retains
  623 inherited warnings outside the extension. No generated artifacts committed.

No unresolved new finding. Approved for the T9 checkpoint. Zero coverage counts do not finish
the delivery audit: rebuild the complete branded artifact and run its type/resource/browser gate
after this checkpoint before marking the continuous goal complete.
