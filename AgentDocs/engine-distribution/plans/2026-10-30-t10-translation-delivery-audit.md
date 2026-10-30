# T10 Complete translation delivery audit

- Type: phase plan
- Status: completed; required T11 follow-up resolved
- Date: 2026-10-30
- Owner: Architecture Agent; execution/review: current task
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T9 checkpoint `ffdb243c62`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned handoff/docs only

## Current evidence and scope

T1 through T9 are independently reviewed/committed. Current docs build reports all 15,294 native
fields covered, missing/stale/unused zero; 2,337 owned Chinese source fields stay separate.
Thirty-two documentation/translation checks and phase-specific browser inspections pass.
All 7,943 symbols preserve non-prose metadata/examples/URLs. Pure numeric/formula descriptions
stay literal; type and identifier spellings are not translated.

Perform the final bounded acceptance on a newly built complete SceneGIS artifact. No new
translation module, runtime behavior, source comment, generator, signature or SDK changes.

## Requirements and evidence

| Requirement                                       | Authoritative evidence                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Every current native prose field covered          | Fresh full-build source/report and complete-coverage tests                     |
| Owned Chinese JSDoc excluded from catalogs        | Source provenance and owned-source tests                                       |
| Current signatures/types/examples/links preserved | All-symbol pre/post prose-stripped comparison and protected-token tests        |
| Package contains updated standalone docs/metadata | Full buildSceneGIS, artifact content/resource tests                            |
| ESM/global declarations and exports stable        | distribution.test.mjs strict standalone consumers and runtime export agreement |
| Both Worlds, lifecycle and root/nested resources  | Full distribution Playwright cases                                             |
| Name-only docs search, type links, Chinese pages  | Existing root/nested docs cases plus phase page inspections                    |
| Source-hash maintenance remains reproducible      | Missing/stale/unused fixture tests and updated maintenance/handoff guides      |
| No SDK/runtime/upstream/generated-file edits      | Git changed-path audit and clean final checkpoint                              |

## Steps and exit

1. Run npx gulp buildSceneGIS once, retaining bounded diagnostics in ignored Build scratch.
2. Run the six focused Node suites (translation/doclets, distribution, documentation, locales,
   source provenance, translations) and the complete distribution Playwright file.
3. Inspect fresh coverage/artifact metadata and compare non-prose data against T9's prior
   snapshot. Update current handoff/readme counts and future source-change procedure.
4. Record final review, scoped lint/format and inherited limitations. Commit the audit/handoff
   checkpoint, inspect clean Git state, and mark the continuous goal complete only if every
   requirement above is proven. Do not broaden into unrelated runtime/GPU tests.

## Outcome

Full branded build, 35 Node checks and 18 browser cases pass. Pre-T1 comparison preserves all
7,943 symbols; bundled guide is current. Final prose-field audit finds omitted see/demo prose.
The [review](../reviews/2026-10-30-t10-translation-delivery-audit.md) carries P1 into T11.
The continuous goal remains active; this audit checkpoint does not approve completion.

T11 now resolves the retained finding and passes the expanded final acceptance; see its
[review](../reviews/2026-10-30-t11-reference-prose.md).
