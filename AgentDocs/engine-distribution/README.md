# SceneGIS engine distribution

## Metadata

| Field                  | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| Extension slug         | `engine-distribution`                                     |
| Status                 | `completed`                                               |
| Planning model         | `extension`                                               |
| Active extension plan  | [Distribution](plans/2026-10-29-extension.md)             |
| Current phase          | C2 completed and reviewed                                 |
| Active standalone plan | None                                                      |
| Active phase plan      | None; latest [C2](plans/2026-10-30-c2-chinese-edition.md) |
| Architecture contact   | Architecture Agent (current task)                         |
| Execution contact      | Execution Agent (current task)                            |
| Last updated           | 2026-10-30                                                |

## Scope

Single-source SceneGIS browser/ESM distribution, bundled resources, declarations,
complete source-derived static API documentation and SDK-consumable metadata.
No SDK edits, internal package renaming, duplicate implementation, runtime version lock,
automatic compatibility checks or registry publication.

## Engineering links

- Source: `scripts/scenegis/`, `scripts/build.js`, `gulpfile.js`, Core/buildModuleUrl.js.
- Tests: owned Node build tests and `Specs/e2e/scenegis-distribution.spec.js`.
- Branch: `feature/scenegis-distribution`.
- ADR: [ADR-0205](../../Documentation/SceneGIS/Decisions/ADR-0205-scenegis-distribution.md).
- SGP: `SGP-0073`, `SGP-0074`.
- Open discussion: none. No separate review agent requested.

## Current language delivery

[ADR-0207](../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
implements Chinese owned public JSDoc and one Chinese documentation edition.
[C1](plans/2026-10-30-c1-chinese-source.md) is [reviewed](reviews/2026-10-30-c1-chinese-source.md)
and committed as `05362428b6`; [C2](plans/2026-10-30-c2-chinese-edition.md) is
[reviewed](reviews/2026-10-30-c2-chinese-edition.md) and complete.

All 73 owned API source files maintain Chinese prose directly. The 2,337 published owned
fields include synthetic VERSION and bypass external translation. Native English comments
remain intact; independent catalogs translate 2,960 of 15,294 native fields. The 12,334 remaining
native fields retain English, with zero stale/unused entries. Each build overwrites source
inventory/report without altering maintained catalogs. Historical bilingual delivery in
[ADR-0206](../../Documentation/SceneGIS/Decisions/ADR-0206-documentation-localization.md) and
[localization review](reviews/2026-10-30-localization.md) is superseded by C1/C2.

## Latest maintenance

[Sidebar name filtering](plans/2026-10-30-sidebar-search.md) is completed and
[reviewed](reviews/2026-10-30-sidebar-search.md): only names in the generated navigation match.
Full SDK metadata remains intact; translation review is build-time source-hash comparison.
Nine metadata tests, ten translation fixtures and two focused browser cases pass.
No upstream or runtime changes.

[Asset directory correction](plans/2026-10-29-asset-directories.md): completed and
[reviewed](reviews/2026-10-29-asset-directories.md). SGP-0074 filters directory entries in the
shared asset stream. Rebuilt artifact has zero empty directories; 8 Node and 7 browser tests pass.

## Current handoff

Generate the complete artifact with `npx gulp buildSceneGIS`; docs-only with buildSceneGISDocs.
One Chinese edition lives at Documentation/index.html with 533 pages and 7,943 symbols.
SDK consumes root api-doclets.json/api-index.json with output locale and per-symbol sourceLocale;
sourceFields identify direct Chinese prose and translatedFields/fallbackFields identify native
translation coverage. No locale discovery or duplicate English tree remains.

Full build, strict declarations, 24 Node checks and eight browser cases pass, including root/nested
resources, both Worlds, Chinese docs, name-only filtering, links and lifecycle. Native buildDocs
also passes. [SDK guide](../../Documentation/SceneGIS/Distribution.md) and
[translation maintenance](../../Documentation/i18n/README.md) cover consumption and native updates.
No SDK edits or upstream-owned files in C1/C2; inherited native JSDoc/lint warnings remain.
No unresolved new finding or active phase.
