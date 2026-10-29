# SceneGIS distribution extension plan

- Type: extension plan
- Status: completed
- Owner: Architecture Agent
- Date: 2026-10-29
- ADR: [0205](../../../Documentation/SceneGIS/Decisions/ADR-0205-scenegis-distribution.md)
- SGP: SGP-0073

## Stable boundary

Keep Cesium source/workspace identities and existing build/test targets. Generate
`Build/SceneGIS` from the same root barrel, with one ESM module identity for downstream
composition. Native export names remain unchanged. No engine dependency on SDK.
Build outputs and doclets are generated artifacts, never hand maintained or committed.

## Roadmap

| Phase                                              | Entry                                         | Exit                                                                                                 | Status    |
| -------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| [D1 runtime](2026-10-29-d1-runtime.md)             | Current bundler/URL/type chain inspected      | IIFE/ESM, resources, declarations, focused tests, review and local commit                            | completed |
| [D2 documentation](2026-10-29-d2-documentation.md) | D1 committed; recheck JSDoc template and tags | Complete static docs, doclets/index, offline bundle verification, SDK guide, review and local commit | completed |

## Risks and overall acceptance

- Preserve Cesium defaults and embedded Worker protocol; target branding only.
- ESM relative URL inference works when served directly; rebundlers explicitly configure base URL.
- Preserve public doclets, nested types/events and custom tags; stable canonical IDs
  are separate from SceneGIS display names. Do not expose AST/private implementation.
- Type declarations and documented runtime values must resolve through the one package entry.
- Validate root/nested deployment, both Worlds, lifecycle, actual Worker/WASM/image loads,
  global precedence, docs search/links and native plus extension export coverage.
- Complete each phase before activating the next; no manual product visual gate is added
  for this distribution-only task.

## Final gate

D1 checkpoint `99c7ce81ca`; [D2 review](../reviews/2026-10-29-d2-documentation.md) approved.
All requested engine distribution/docs contracts verified. No SDK edits, publishing or runtime
version checks. See the [SDK handoff guide](../../../Documentation/SceneGIS/Distribution.md).
