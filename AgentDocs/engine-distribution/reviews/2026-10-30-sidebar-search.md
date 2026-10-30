# Sidebar name filtering review

- Type: standalone review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [sidebar search plan](../plans/2026-10-30-sidebar-search.md)
- ADR: [0206](../../../Documentation/SceneGIS/Decisions/ADR-0206-documentation-localization.md)
- SGP: none; no upstream-owned file changed

## Assessment and findings

No unresolved finding. The generated sidebar is the exact search scope, preserving native
class/global/namespace selection and alias display names without duplicating publisher rules.
Names alone determine matches. Member records and summaries remain in the SDK index, but the
page does not fetch it. Keyboard/query navigation, empty input and locale/type links remain.
Removed unused loading/failure messages because there is no asynchronous index dependency.

The source-hash mechanism is unchanged. Guidance explicitly states that comparison happens
only after local source updates and a documentation build, detects textual rather than
semantic differences, and does not monitor upstream or revise translations automatically.

## Evidence and gate

- buildSceneGISDocs passed; both locales retain 7,943 symbols, 3,150 translated fields and
  zero stale/unused entries for the unchanged source.
- Nine metadata/link tests passed, including complete index/anchor coverage and locale identity.
- Ten translation fixtures passed, including changed-source rejection and obsolete-field reports.
- Two real-browser documentation cases passed: no prose/member matches, case-insensitive class
  matches, restored navigation, Enter activation, language round-trip, type links and no UI
  api-index request. SDK member metadata remains present.
- Scoped ESLint/Prettier and Markdown checks pass. No runtime/public declaration/build API change;
  no additional engine build/type/GPU matrix is justified for this static documentation change.
- No generated file is included. Owned paths only, no SGP or SDK edits.

Approved for the local checkpoint. Existing partial-translation coverage remains the documented
limit; this change adds no new unresolved risk.
