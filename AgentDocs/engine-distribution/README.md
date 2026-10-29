# SceneGIS engine distribution

## Metadata

| Field                 | Value                                         |
| --------------------- | --------------------------------------------- |
| Extension slug        | `engine-distribution`                         |
| Status                | `active`                                      |
| Planning model        | `extension`                                   |
| Active extension plan | [Distribution](plans/2026-10-29-extension.md) |
| Current phase         | D1 complete; D2 pending                       |
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

D1 is complete and [reviewed](reviews/2026-10-29-d1-runtime.md). Create the local checkpoint
before activating D2. Next: source-derived static API docs, metadata and SDK handoff.
