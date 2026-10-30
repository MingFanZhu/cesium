# SceneGIS distribution extension plan

- Type: extension plan
- Status: active
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

## Chinese source and delivery amendment (2026-10-30)

ADR-0207 adds two sequential phases after the completed distribution/localization work:

- [C1 Chinese source](2026-10-30-c1-chinese-source.md): completed and reviewed; all owned public prose and source-language handling migrated with unchanged runtime/types.
- [C2 single Chinese edition](2026-10-30-c2-chinese-edition.md): completed and reviewed after C1 checkpoint `05362428b6`; single Chinese output/UI/SDK guidance and full build/type/browser gate pass.

Native comments and build targets remain intact. Native translations stay external; owned Chinese JSDoc is the only maintained prose source. No SDK changes.

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

C1/C2 Chinese-source amendment is complete under ADR-0207 and its phase reviews. Runtime and
native comments/targets remain unchanged; source-hash translation is now native-only.

## Complete native translation program (2026-10-30)

The owner explicitly requests continuous progress until all current native prose is Chinese.
The initial common-API checkpoint is `20a9fcac91`: 4,287/15,294 native fields translated,
11,007 missing, zero stale/unused. Continue this stable extension with sequential editorial
phases, each reviewed and committed before the next begins. No new runtime or generator scope.

- [T1 foundation](2026-10-30-t1-foundation-translation.md): completed and reviewed;
  coordinate/vector/matrix/color/bounds/math APIs add 2,107 fields, reaching 41.8% native coverage.
- T2 loading and time: resources, time, terrain and provider APIs; inspect the remaining report
  after T1 before choosing concrete roots and files.
- T3 rendering and data: models, rendering options, data/property/geometry APIs; elaborate only
  when entered using the then-current inventory.
- T4 remainder and final gate: cover every remaining native field, resolve changed/unused
  catalog records, and verify missing/stale/unused are all zero. Preserve semantic metadata,
  code, links and Chinese owned-source separation throughout.

The final acceptance is complete current-source coverage, faithful units/constraints and
reviewed editorial quality. Counts do not replace reading the source and translation.
