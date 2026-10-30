# SceneGIS engine distribution

## Metadata

| Field                 | Value                                         |
| --------------------- | --------------------------------------------- |
| Extension slug        | `engine-distribution`                         |
| Status                | `completed`                                   |
| Planning model        | `extension`                                   |
| Active extension plan | [Distribution](plans/2026-10-29-extension.md) |
| Current phase         | D1, D2 and localization complete              |
| Active phase plan     | None                                          |
| Architecture contact  | Architecture Agent (current task)             |
| Execution contact     | Execution Agent (current task)                |
| Last updated          | 2026-10-30                                    |

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

## Latest localization

[Independent localization](plans/2026-10-30-localization.md) is completed under
[ADR-0206](../../Documentation/SceneGIS/Decisions/ADR-0206-documentation-localization.md) and
[reviewed](reviews/2026-10-30-localization.md). Generic translations/tools live outside Source
and brand-specific directories. Chinese coverage is 3,150/17,631 fields (17.9%), including all
73 extension entry descriptions. Missing text retains English with explicit coverage metadata.
Each locale delivers 533 pages and 7,943 symbols. No source comments or SDK changes.

## Latest maintenance

[Asset directory correction](plans/2026-10-29-asset-directories.md): completed and
[reviewed](reviews/2026-10-29-asset-directories.md). SGP-0074 filters directory entries in the
shared asset stream. Rebuilt artifact has zero empty directories; 8 Node and 7 browser tests pass.

## Current handoff

D1 checkpoint: `99c7ce81ca`. [D2 review approved](reviews/2026-10-29-d2-documentation.md).
Complete artifact is generated with `npx gulp buildSceneGIS`; docs-only with buildSceneGISDocs.
533 HTML pages per locale and 7,943 indexed symbols per locale, all public SceneGIS roots, root/nested IIFE/ESM
resource loads and both World lifecycles verified. No unresolved new finding or active phase.

[SDK handoff](../../Documentation/SceneGIS/Distribution.md) describes entries, global resource
precedence, declarations, metadata and single ESM identity. Existing native JSDoc warnings
and explicit-base requirements after rebundling remain documented limits. No SDK edits.
