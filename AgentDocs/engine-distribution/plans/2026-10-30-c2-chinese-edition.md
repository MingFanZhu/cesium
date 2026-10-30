# C2 Single Chinese edition

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed
- Parent: [distribution plan](2026-10-29-extension.md)
- Prerequisite: C1 checkpoint `05362428b6`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned generator/template/tests/guides only

## Current facts and design

The current builder invokes JSDoc twice, publishes English at the root and Chinese under
zh-CN, and injects a language switch. Only the English run emits the native translation source
inventory. C1 already isolates owned Chinese prose from the external native catalogs/report.
Graph lacks current documentation builders; source inspection confirms the gulp entry delegates
to the owned builder and the native template is copied before rendering.

Build once in zh-CN directly at Documentation. Emit native translation-source.json before
translation in the same run, alongside translation-report.json and complete SDK metadata.
Remove locale discovery/switch UI, unused English UI and English readme. Preserve native
templates/targets, canonical IDs, semantic/custom fields, name-only sidebar search and links.
Update SDK guidance and tests to describe one output edition with two source languages.

## Implementation and acceptance

1. Simplify owned builder/publisher/search and remove unused English-only inputs.
2. Verify the single tree and complete anchors/metadata, Chinese owned fields, native-only
   inventory and source-hash reports. Preserve executable examples, signatures and brand mapping.
3. Run full SceneGIS build, distribution declaration checks and existing runtime/browser cases;
   verify root/nested Chinese documentation, search, type links and capture a real screenshot.
4. Update language policy handoff and independent translation maintenance guide. Review and
   checkpoint separately from C1; commit no generated artifacts or SDK changes.

## Risks

Inventory must capture original English before translation/branding. Output cleanup must remove
old locale artifacts. Native gaps remain visible English text and explicitly reported, not falsely
claimed Chinese coverage. Six existing terrain source lint errors remain outside this doc scope.

## Outcome and gate

Single zh-CN output is at Documentation with 533 pages and 7,943 symbols, no locale discovery,
switch UI or duplicate language tree. Native inventory/report are emitted together before brand
mapping. All 2,337 owned fields are direct Chinese source; native inventory has 15,294 fields,
2,960 translated, 12,334 missing and zero stale/unused.

Full buildSceneGIS and 24 focused Node tests pass, including strict standalone ESM/global type
consumers, export agreement and all anchors. Eight browser cases pass; the Chinese case is also
verified at the root mount, while the sidebar/type-link case covers a nested mount. Screenshot
inspection confirms Chinese descriptions and parameter tables. Generator/test ESLint, scoped
Prettier and full AgentDocs Markdown lint pass. Whole-tree AgentDocs Prettier retains unrelated
historical warnings; the changed extension passes. Native buildDocs and runtime/type/example
identity were verified in C1. No upstream-owned file, SDK or generated artifact changed.

[Review](../reviews/2026-10-30-c2-chinese-edition.md) approves the local checkpoint.
