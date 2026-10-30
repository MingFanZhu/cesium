# ADR-0207: Chinese source JSDoc and one Chinese documentation edition

- Status: accepted and implemented
- Date: 2026-10-30
- Owner: Architecture Agent (current task)
- Related: [ADR-0206](ADR-0206-documentation-localization.md),
  [distribution plan](../../../AgentDocs/engine-distribution/plans/2026-10-29-extension.md)
- Upstream patches: none anticipated
- Supersedes: ADR-0206 bilingual delivery and English-only source assumptions

## Context

The product owner requests a single Chinese SceneGIS documentation edition and Chinese
JSDoc as the source of truth for owned APIs. Current metadata contains 923 owned doclets
across 73 engine/Widgets files and 2,336 prose fields, with incomplete external translations.
Native source comments must remain English and native build targets retain their route.

## Decision

Maintain public prose directly in Chinese in the existing owned engine/Widgets source files.
Keep JSDoc tags, identities, types, defaults, inline link targets, examples and executable code.
Private implementation comments remain English. Update root/engine language rules accordingly.
Do not maintain parallel English-to-Chinese catalog entries for these owned APIs.

The documentation publisher distinguishes source language by explicit source ownership:
owned Source/SceneGIS doclets are zh-CN; native doclets retain en-US and use the independent
source-hash catalog. Metadata declares each doclet's sourceLocale and all sourceLocales.
Direct Chinese fields are identified as sourceFields, not externally translated fields.
Only native English prose enters translation inventory, stale checks and coverage reports.

SceneGIS delivery emits one zh-CN edition at Build/SceneGIS/Documentation with HTML and SDK
JSON metadata. Remove duplicate English trees, locale discovery/switching and unused English
UI data. Preserve name-only sidebar search and full SDK symbol metadata. Native buildDocs
continues its existing source/config/publisher path; no native file or comment is translated.
Untranslated native prose remains English with an explicit report until editorially supplied.

## Phases and verification

C1 migrates owned public JSDoc, language policy, source-language handling and obsolete catalog
records. Verify complete owned prose, runtime token identity, public declaration identity and
source-derived docs/links, then checkpoint. C2 simplifies delivery/UI/tests/guides to one
Chinese edition and verifies full distribution/types, root/nested docs and existing runtime
smoke cases. Keep metadata semantic/custom fields and canonical IDs throughout.

Neither phase edits SDK, renames runtime classes, changes runtime behavior, modifies native
comments or hand-edits generated output. Existing native translation gaps remain reported.

## Reference and demo prose amendment

The complete-coverage audit found English see/demo guidance omitted from the original prose
visitor. Treat natural-language see/demo entries and explicit link display labels as prose,
using see/index and demo/index source-hash selectors. Pure symbol/URL references, links without
labels and code remain literal. Preserve targets and clone mutable tag arrays before changing
text. This extends the same independent build-time route; it adds no engine/SDK runtime API.

## Outcome

C1 checkpoint is `05362428b6`. C2 delivers 533 pages and 7,943 symbols in one Chinese tree.
All 2,337 owned prose fields (including synthetic VERSION) come directly from Chinese source;
native-only inventory contains 15,294 fields with 2,960 translations and 12,334 English fallbacks.
No stale or unused record remains. Full distribution/types and root/nested browser checks pass;
native buildDocs also passes. See the extension phase reviews for evidence and inherited limits.
