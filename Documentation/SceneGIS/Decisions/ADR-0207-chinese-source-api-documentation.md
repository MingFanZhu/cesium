# ADR-0207: Chinese source JSDoc and one Chinese documentation edition

- Status: accepted; implementation in progress
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
