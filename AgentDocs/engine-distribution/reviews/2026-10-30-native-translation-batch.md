# Native translation batch review

- Type: standalone review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [native translation batch](../plans/2026-10-30-native-translation-batch.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment

The batch completes all 1,476 prose fields of 18 common native roots, adding 1,327 entries
without changing the generator or source. Each record retains its original ID, field selector
and source hash. Repeated text reuses one reviewed translation; ambiguous or merely similar
source is not fuzzily matched. Markup, URLs, inline targets, code and captions retain the
existing protection contract. Owned Chinese APIs remain outside this process.

## Editorial findings and disposition

- Fixed in Chinese: Viewer flyTo/zoomTo pitch prose conflicted with Camera. Viewer delegates to
  CesiumWidget, which uses Camera.flyToBoundingSphere/viewBoundingSphere; Camera's
  offsetFromHeadingPitchRange uses a negative pitch rotation and negates the resulting offset.
  Positive pitch therefore places the offset below the XY plane, matching Camera's prose.
  The batch tests require consistent signs without touching upstream comments or runtime.
- Fixed in Chinese: GeoJsonDataSource.crsLinkHrefs prose incorrectly names itself as the lower
  priority map. The actual loader first reads crsLinkHrefs[properties.href], then falls back to
  crsLinkTypes[properties.type]. Chinese states that order and preserves the existing code token.
- Fixed in Chinese: ImageryLayer constructor magnification text says minification, while its
  property and enum are TextureMagnificationFilter; ready says terrain provider while the
  adjacent imageryProvider/readyEvent API describes imagery creation. Wording follows those
  explicit public roles. Terrain shadow wording follows its constructor's cast/receive contract.
- Fixed in Chinese: EntityCollection.resumeEvents prose has a self-referential pairing typo.
  Its implementation decrements the suspend counter and rejects a zero counter, so wording
  explicitly pairs suspension and resumption while preserving the inline link target.
- Preserved: malformed upstream JSDoc places an @example/code tail in the fromWorldImagery
  return description. Only the preceding prose is translated; the exact code tail is retained
  and has a focused regression check. Upstream cleanup remains outside this editorial batch.

## Evidence and gate

- Docs-only build passes: 4,287 native translated fields, 11,007 missing, zero stale/unused.
- Twenty-two Node checks pass: complete selected roots, source-hash/markup protection, spatial
  units, ownership, query and event limits, native-only reports and all metadata URLs/anchors.
- Three browser docs cases pass, including name-only search, root/nested layouts, native camera
  parameters, Viewer ownership and tileset constraints. No page errors or failed local requests.
- Screenshot inspected. All non-prose metadata, signatures, examples and URLs match before/after.
- Scoped ESLint/Prettier and Markdown checks pass. Whole-tree AgentDocs formatting retains
  historical warnings outside this extension. No runtime, type or rendering path changed;
  full engine/type/GPU rebuilds add no evidence for catalog-only additions and were not rerun.
- No SDK, generated artifact or upstream-owned file is staged; no SGP needed.

No unresolved new finding. The 11,007 untranslated native fields outside this batch remain an
explicit editorial backlog, retaining their English source and report entries. Approved to commit.
