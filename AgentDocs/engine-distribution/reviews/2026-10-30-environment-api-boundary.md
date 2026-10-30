# Environment API boundary review

- Type: standalone review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [environment boundary](../plans/2026-10-30-environment-api-boundary.md)
- ADR: [0205](../../../Documentation/SceneGIS/Decisions/ADR-0205-scenegis-distribution.md),
  [0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md)
- SGP: none; no upstream-owned file changed

## Assessment

The notices match current Scene/Globe/PlanarWorld gates, rather than describing a speculative
conflict when two visuals are enabled. Native sky/Sun/visual fog/ground atmosphere/daylight
branches are skipped by the deferred profile even when advanced effects are disabled.
Fog tile selection, Globe Moon/ephemeris, light and geometry shadow control retain their roles.
The docs do not deprecate complete native classes or suggest restoring legacy visuals.

Owned environment constraints live directly in Chinese public JSDoc. Native product notices
live outside upstream comments and generic translation catalogs, appended after source/report
generation to the common HTML/SDK descriptions. Canonical IDs, sourceLocale, translation
hashes and original prose are retained. The original Cesium docs target is not modified.

## Validation

- buildSceneGISDocs passes: 15,523/15,523 native fields; zero missing/stale/unused.
- Thirty-seven documentation/translation Node checks pass, including all sixteen annotated
  symbols, preserved Fog/lighting roles, generated links and Chinese source constraints.
  Native translation-source/report are byte-identical before/after.
- Browser case passes at root and nested mounts. Native notice links navigate to the
  maintained controller; Fog retains its tile-selection explanation. SkyAtmosphere screenshot
  inspected: notice appears beside the original description, before parameters/examples.
- Transforming the three edited source files with comments stripped produces identical
  executable code before/after. Scoped ESLint and formatting pass.
- Full AgentDocs Markdown lint passes. Whole-tree formatting retains the known inherited
  warnings outside this extension; modified AgentDocs paths pass explicit formatting.

No new unresolved finding. Existing historical atmosphere visual/fixture issues remain in
their original reviews; this documentation change does not close them. Full runtime/GPU/type
rebuild is unnecessary for comments and documentation-only composition. Approved for a local
checkpoint; commit no generated artifact, SDK file or upstream change.
