# Sidebar API name filtering

- Type: standalone plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed
- ADR: [0206](../../../Documentation/SceneGIS/Decisions/ADR-0206-documentation-localization.md)
- SGP: none; owned documentation assets only

## Facts and scope

The graph lacks current documentation search nodes; direct inspection confirms the owned
search asset matches every api-index symbol name plus its summary. Native buildNav already
emits the intended sidebar classes, namespaces, interfaces and globals as named list items.
Use those items directly to filter names; do not fetch the full SDK metadata for this UI.
Retain complete member doclets/index data for downstream consumers and in-page links.

## Steps and acceptance

1. Filter only the names actually shown in ClassList; preserve query navigation, language
   switching, empty-query restoration and keyboard behavior.
2. Update localized prompts, handoff guidance and browser regression cases. Verify both
   English/Chinese description-only terms and member-only terms produce no matches.
3. Rebuild docs through the generator, run focused metadata/translation and browser tests,
   scoped lint/format checks, review and create a local checkpoint.

## Translation change explanation

No source-monitoring service is introduced. At each documentation build, JSDoc extracts
current source prose; symbol ID + field + normalized-source SHA-256 select the translation.
Changed source keeps English and appears as stale/source-changed, deleted fields as
field-removed and newly untranslated fields as missing. Reports request editorial review;
the tool neither determines semantic equivalence nor automatically updates Chinese prose.

## Outcome

Search uses the native sidebar names and relative links directly, without downloading the
full metadata. Full member metadata and type links remain intact. Localized prompts and
guides describe name-only matching and the build-time change-detection boundary.
Docs rebuilt successfully; 9 metadata/link tests, 10 translation fixtures and 2 browser
cases passed. Browser cases reject prose-only and member-only queries, preserve case-insensitive
class filtering, keyboard navigation, language switching and type links, and verify no UI
api-index request. See the [review](../reviews/2026-10-30-sidebar-search.md).
