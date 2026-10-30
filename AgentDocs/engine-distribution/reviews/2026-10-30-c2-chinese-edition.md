# C2 Chinese edition review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [C2 plan](../plans/2026-10-30-c2-chinese-edition.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; owned integration only

## Assessment

One owned build renders zh-CN at the documentation root through the existing copied native
template. Cleanup removes old locale output; unused English UI/readme and language switching
are deleted. Name-only sidebar search, semantic/custom fields, canonical IDs and links remain.
Native inventory is captured before localization and branding in the same run as its report.
Owned Chinese prose never enters external catalogs, fallback reporting or pending extraction.

The SDK guide distinguishes output language from per-symbol source provenance and documents
sourceFields versus translatedFields/fallbackFields. Native translation is explicitly partial.
No new runtime fallback, compatibility mechanism, dependency or SDK edit is introduced.

## Evidence and findings

- Full buildSceneGIS passes; 533 pages and 7,943 complete metadata/index symbols remain.
- Twenty-four Node checks pass: strict standalone declarations and actual ESM exports, resources,
  every URL/anchor, source provenance, native hash reports and Chinese owned prose.
- Eight browser cases pass: six existing runtime/resource/World lifecycle cases, nested name-only
  search/type links and Chinese source content. The Chinese case additionally passes at root
  deployment. No browser exceptions or failed local resource requests. Screenshot reviewed.
- Source migration preserves runtime ASTs, declaration signatures and 27 examples (C1 gate).
  Native buildDocs passes on its existing path. Existing native type-generator warnings and six
  unchanged terrain lint errors remain inherited; no additional rendering/physics runs are needed.
- Generator/test ESLint, changed-extension Prettier and full AgentDocs Markdown lint pass.
  Whole-tree AgentDocs formatting warnings are pre-existing outside the changed extension.
- No upstream-owned file or generated artifact is included; no SGP and no SDK changes.

No unresolved new finding. Native translation gaps remain an explicit editorial backlog.
Approved for the separate C2 checkpoint.
