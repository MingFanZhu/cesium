# SceneGIS engine distribution

## Metadata

| Field                 | Value                                         |
| --------------------- | --------------------------------------------- |
| Extension slug        | `engine-distribution`                         |
| Status                | `completed`                                   |
| Planning model        | `extension`                                   |
| Active extension plan | [Distribution](plans/2026-10-29-extension.md) |
| Current phase         | D1 and D2 complete                            |
| Active phase plan     | None                                          |
| Architecture contact  | Architecture Agent (current task)             |
| Execution contact     | Execution Agent (current task)                |
| Last updated          | 2026-10-29                                    |

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
- SGP: `SGP-0073`.
- Open discussion: none. No separate review agent requested.

## Current handoff

D1 checkpoint: `99c7ce81ca`. [D2 review approved](reviews/2026-10-29-d2-documentation.md).
Complete artifact is generated with `npx gulp buildSceneGIS`; docs-only with buildSceneGISDocs.
533 HTML pages and 7,943 indexed symbols, all public SceneGIS roots, root/nested IIFE/ESM
resource loads and both World lifecycles verified. No unresolved new finding or active phase.

[SDK handoff](../../Documentation/SceneGIS/Distribution.md) describes entries, global resource
precedence, declarations, metadata and single ESM identity. Existing native JSDoc warnings
and explicit-base requirements after rebundling remain documented limits. No SDK edits.
