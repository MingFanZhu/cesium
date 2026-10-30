# T2 Loading and time translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T2](../plans/2026-10-30-t2-loading-time-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and findings

Added 1,699 source-bound records across five catalogs; all 2,361 fields of 60 selected roots
are Chinese. Promise rejection/throttled undefined returns, retry callbacks, units, UTC/TAI/leap
seconds, interval inclusion and data precedence, projection limits, tile masks and provider
factory restrictions remain explicit. HTML, links, literal code and examples stay intact.

Editorial findings were resolved against current source:

- Fixed: Terrain.ready and ImageryLayer.ready share an erroneous English terrain-provider
  sentence. Chinese is bound separately to each symbol and identifies terrain versus imagery.
  Exact text reuse was reviewed in context; maintenance guidance now states this requirement.
- Fixed: Resource.setTemplateValues combines objects, with new values winning by default and
  existing values winning for useAsDefault. It does not accumulate arrays as the English says.
- Fixed: TerrainProvider.getRegularGridIndices chooses Uint16Array for fewer than 65,536 vertices,
  Uint32Array otherwise, rejecting totals at or above 4,294,967,296. The English 64KB/4GB labels
  and 65,536 maximum are misleading; Chinese states vertex counts and actual bounds.
- Fixed: JulianDate.equalsEpsilon uses an inclusive comparison. TimeInterval additionally tests
  endpoint inclusion and data, and accepts two empty intervals; its copy-pasted date prose is
  clarified in context. HeightmapTessellator reconstructs multi-element heights using
  elementsPerHeight and elementMultiplier, not the erroneous strideMultiplier terminology.
- Verified: GoogleEarthEnterpriseTerrainData child bit 2 denotes northeast; QuantizedMesh and
  Heightmap child bit 2 denotes northwest. Separate translated tables retain these differences.
  Provider factory/type copy errors are clarified only in prose, keeping link targets intact.

## Validation and gate

- Docs build passes: 8,093 translated of 15,294, 7,201 missing, zero stale/unused (52.9%).
- Twenty-four Node checks pass, including all 98 reviewed roots, every metadata page/anchor,
  protected tokens/hashes, source-language separation and focused loading/time semantics.
- One focused nested browser case passes without page/resource errors; screenshot reviewed
  at the real JulianDate.equalsEpsilon static anchor, showing Chinese tables and inclusive units.
- Before/after comparison preserves all 7,943 symbols' non-prose metadata, signatures, example
  bodies and URLs. No runtime, public API, SDK or generator changes; runtime/type/GPU rebuilds
  are outside this editorial phase's risk boundary.
- Scoped ESLint/Prettier and AgentDocs Markdown checks pass. Whole-tree AgentDocs formatting
  retains inherited warnings outside this extension; no unrelated formatting is bundled.

No unresolved new finding. Approved for a local T2 checkpoint, followed by current-inventory
inspection for T3. The continuous goal remains active until all native translation gaps are zero.
