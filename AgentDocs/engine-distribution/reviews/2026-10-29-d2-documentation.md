# D2 documentation and SDK handoff review

- Type: phase review
- Status: approved
- Owner: Architecture Agent (current task); execution: same task
- Date: 2026-10-29
- Target: [D2](../plans/2026-10-29-d2-documentation.md), source-derived docs and complete artifact
- Prerequisite checkpoint: `99c7ce81ca`
- ADR/SGP: ADR-0205 / SGP-0073

## Findings and disposition

| Finding                                                                                                                                      | Severity    | Owner           | Status and evidence                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native JSDoc pruning retains members of private parents, producing 1,798 orphan links after branded root selection                           | medium      | Execution Agent | fixed by requiring a public documented root; no private parent is promoted; exhaustive metadata page/anchor test passes                                                           |
| Fifteen owned getters used several JSDoc tags on one line, making memberof include type/readonly text and losing both pages and declarations | medium      | Execution Agent | fixed tags in SceneGISEnvironmentEffects, SceneGISPlanarCylinderGeometry and SceneGISPlanarEllipsoidGeometry; docs/type generation and all anchors pass; no runtime change        |
| Global typedef names were labeled as runtime exportName                                                                                      | medium      | Execution Agent | fixed: omit exportName for pure global type symbols; retain actual root barrel export for nested types and native alias mapping; explicit binarySearchComparator assertion passes |
| Native grouped navigation requires meta.package on every entry, including synthesized VERSION                                                | integration | Execution Agent | use native ungrouped navigation for the branded docs; complete public root navigation and member search pass; native Cesium docs task unchanged                                   |

## Architecture and ownership review

- Owned publisher composes the native publisher and final helper link map; templates are copied
  into ignored staging and receive bounded brand presentation changes. No maintained template fork.
- The staging CommonJS adapter loads the owned CJS publisher. Build-machine paths remain only in
  ignored staging/config, never in the shipped documentation metadata.
- Metadata preserves canonical IDs, signatures, properties, Event members, typedefs, enums,
  inheritance, examples and all current custom tags. It excludes AST, raw comments, Taffy state,
  undocumented/private roots and machine paths. Aliased display names do not rename runtime classes.
- Public BASE_URL globals are declared for script and ESM TypeScript consumers. Runtime and public
  declaration values are compared; only original soft-private JS exports stay outside public types.
- SDK guide is copied into the artifact README, with namespace, deployment, one-module composition,
  metadata schema and actual native export names. No SDK or distribution destination is modified.

## Validation

- Native `npx gulp buildDocs`: passed after the owned JSDoc fixes.
- Complete `npx gulp buildSceneGIS`: passed, including native builders, native buildTs, standalone
  declarations, all runtime assets/licenses, docs and copied integration guide.
- `npx gulp buildSceneGISDocs`: passed after final metadata exportName clarification; refreshes
  both API docs and copied README.
- `npx gulp tsc`: passed. Native buildTs smoke/declaration compilation passed within full target.
- Node distribution/documentation tests: 6 passed. Every public SceneGIS root is covered; every
  indexed page and anchor resolves. Public native and Widgets samples, events, inheritance, enums,
  typedefs, custom tags and branded examples are checked.
- Final browser matrix: 7 passed (six runtime/resource cases plus nested standalone docs). The
  final docs-only refresh additionally passes its focused browser case. Requests to external
  services are blocked. No new product runtime code path depends on the test harness.
- API page screenshot inspected: SceneGIS branding, native names and linked parameter types render.
- Scoped ESLint/Prettier and markdownlint pass; upstream audit passes (D2 delivery: gulpfile.js;
  complete extension: three SGP-0073 files) and zero
  generated Git changes. Whole AgentDocs formatting retains unrelated pre-existing debt (623 files
  in the full check); current extension formatting passes and whole AgentDocs markdownlint passes.

Evidence logs: ignored `Build/distribution-d2-*`; screenshot:
`Build/Specs/e2e/distribution/scenegis-distribution-stan-6eefe-bers-and-follows-type-links/api-documentation.png`.

Artifact: 533 HTML pages, 7,943 semantic doclets/index symbols, all 73 public SceneGIS roots;
ESM 7,686,163 bytes, IIFE 9,510,581 bytes; approximately 135 MiB total uncompressed including
resources and documentation. JSON metadata is approximately 9.37 MiB doclets plus 3.44 MiB index.

## Remaining limits and gate

No unresolved new finding. Existing native tsd-jsdoc warnings/any declarations are retained rather
than changing unrelated Cesium APIs. Direct ESM inference is verified; downstream rebundling or
IIFE renaming requires an explicit asset root, as documented. Static docs are served over HTTP(S).
The SDK website owns its rendering/search integration and export collision policy; registry
publication is outside scope. D2 architecture gate approved for the local checkpoint.

Upstream-owned files for the complete extension: `scripts/build.js`, `gulpfile.js`,
`packages/engine/Source/Core/buildModuleUrl.js`, all SGP-0073. D2 only extends its existing gulp
task-export seam; owned JSDoc fixes need no SGP. No generated files are staged.
