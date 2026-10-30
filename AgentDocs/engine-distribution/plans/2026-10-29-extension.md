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
- [T2 loading and time](2026-10-30-t2-loading-time-translation.md): completed and reviewed after T1 checkpoint
  `7141d62015`; 60 resource/time/terrain/provider roots with 1,699 missing fields.
- [T3 rendering](2026-10-30-t3-rendering-translation.md): completed and reviewed; 1,560 new
  records complete 80 roots and reach 63.1% coverage. Checkpoint `1b84d87298`.
- [T4 entity data](2026-10-30-t4-data-translation.md): completed and reviewed; 1,471 new
  records complete 91 roots and reach 72.7% coverage. Checkpoint `e8224e7504`.
- [T5 geometry/numerics](2026-10-30-t5-geometry-translation.md): completed and reviewed;
  1,547 new records complete 95 roots and reach 82.8% coverage. Checkpoint `67269fc68a`.
- [T6 widgets and input](2026-10-30-t6-widget-input-translation.md): completed and reviewed after T5 checkpoint;
  832 new records complete 69 widget/input/controller roots and inherited native fields. Checkpoint `03dab19ec1`.
- [T7 utilities](2026-10-30-t7-utility-translation.md): completed and reviewed; 509 new records across
  55 utility and rendering-constant roots after T6 checkpoint. Checkpoint `9af3d7e757`.
- [T8 metadata/providers](2026-10-30-t8-metadata-provider-translation.md): completed and reviewed;
  572 new records complete 52 roots after T7 checkpoint. Checkpoint `1910049d45`.
- [T9 specialized APIs](2026-10-30-t9-specialized-translation.md): completed and reviewed; 710 final
  records complete 66 roots after T8 checkpoint. Checkpoint `ffdb243c62`.
- [T10 final audit](2026-10-30-t10-translation-delivery-audit.md): completed with required P1 follow-up; full branded
  artifact, declaration/resource/browser checks pass. Inventory omits see/demo prose;
  T11 will correct extraction/translation before the goal can close.
- [T11 reference prose](2026-10-30-t11-reference-prose.md): completed and reviewed after T10 checkpoint;
  correct omitted see/demo prose in the owned extractor, translate new units and repeat final
  acceptance. This confirmed build-time gap amends the earlier catalog-only scope.
- Remainder and final gate: cover every remaining native field, resolve changed/unused
  catalog records, and verify missing/stale/unused are all zero. Preserve semantic metadata,
  code, links and Chinese owned-source separation throughout.

The final acceptance is complete current-source coverage, faithful units/constraints and
reviewed editorial quality. Counts do not replace reading the source and translation.

## Translation program final gate

T11 closes T10 P1 with 229 reference/demo fields added to the same source-hash route. Fresh full
artifact covers all 15,523 native fields; missing/stale/unused are zero, with 2,337 independent
Chinese source fields. Full build, strict declarations, 38 Node checks and 19 browser cases pass.
All 7,943 symbols preserve signatures/types/example bodies/canonical URLs; 533 pages remain.
The [final review](../reviews/2026-10-30-t11-reference-prose.md) approves completion. Future
source changes use the maintained hash reports and complete-coverage tests; no SDK/runtime edits.
