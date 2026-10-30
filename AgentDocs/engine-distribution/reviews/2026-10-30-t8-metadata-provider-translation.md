# T8 Metadata and provider translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T8](../plans/2026-10-30-t8-metadata-provider-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and resolved findings

Three catalogs add 572 records, completing all 641 fields of 52 roots. Reviewed the 23 exact
reused texts and repeated contexts, including enum expansion. Keep little-endian byte offsets,
milliradians versus radians, ellipsoidal height, covariance storage, bit masks and metadata GPU
storage distinct. Preserve prose-embedded JSON/code/formulas byte for byte, alongside signatures,
types, example bodies, canonical identities and link targets.

Current-code evidence resolves source inaccuracies:

- createGooglePhotorealistic3DTileset reads apiOptions.onlyUsingWithGoogleGeocoder. The source
  description misspells this in a protected inline literal. Chinese explicitly directs callers
  to the actual parameter table and retains the original token without recommending its use.
- GoogleEarthEnterpriseMapsProvider has its own fromUrl factory. A copied source notice links
  the other imagery provider; Chinese identifies this class's factory and presents the existing
  protected link as the related imagery entry. No native comment/link rewrite.
- MetadataComponentType.UINT64 copied signed-integer prose. Both member and enum-property
  records now correctly say unsigned, checked separately. GPU byte-size calculation uses the
  packed component type and component/array counts, which may differ from CPU 64-bit storage.
- GeocoderService.Result.destination is Rectangle|Cartesian3, so Chinese describes either a
  region or position. TileAvailability's child mask is southwest=1, southeast=2, northwest=4,
  northeast=8; addAvailableTileRange includes both end coordinates. The provider retry flag is
  determined by the final listener; iTwin shares take precedence over access tokens.

Accepted inherited identity limits: NGA anchronPoint spelling and protected Google flag literal
remain verbatim. Catalogs clarify their meaning without changing signatures or source identity.
External-service prose describes this engine's current contracts, not live service availability.

## Validation and gate

- Docs build passes: 14,584/15,294 translated (95.4%), 710 missing, zero stale/unused.
- Thirty Node checks pass, covering all 540 reviewed roots, storage/coordinate units, UINT64,
  matrices, limits, availability and retry semantics, provenance and protected-token safety.
- Focused nested browser case passes without page/resource errors. CorrelationGroup displays
  milliradians; screenshot inspection confirms Chinese child masks, parameters and return values.
- Before/after comparison preserves all 7,943 symbols' non-prose metadata, examples and URLs.
- Scoped ESLint/Prettier and Markdown checks pass; whole-tree AgentDocs formatting retains
  623 inherited warnings outside this extension. No runtime, source, generator or SDK changes.

No unresolved new finding. Approved for the T8 checkpoint. Inspect the final specialized-API
inventory only after committing this phase. The full translation goal remains active.
