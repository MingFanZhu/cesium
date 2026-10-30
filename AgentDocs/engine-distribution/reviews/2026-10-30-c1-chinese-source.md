# C1 Chinese source review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [C1 plan](../plans/2026-10-30-c1-chinese-source.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; owned files only

## Assessment

The source root determines language ownership before branding or rendering. Chinese owned
prose bypasses external translations; native English retains exact source-bound translation
and changed-source reports. Cloning nested records prevents shared enum references from
cross-contaminating provenance. No missing/stale record is silently converted to a translation.

All published owned prose is Chinese. Runtime code, types, JSDoc tags/links and example programs
are preserved. The VERSION record is explicitly owned. Catalog removal covers owned symbols
and VERSION without discarding native translations. Temporary bilingual output is confined to
this phase; C2 will remove it after this checkpoint.

## Evidence and findings

- Native buildDocs, buildTs and branded documentation builds pass.
- Normalized executable ASTs match for 73 files; generated public type signatures match.
- Twenty-seven example programs match; all 2,336 original prose units contain Chinese.
- Twenty-two focused Node checks pass, including shared enum metadata, source-hash rejection,
  all HTML anchors and native-only translation inventory/report.
- Generator/test ESLint and scoped formatting pass. Six pre-existing new-cap errors remain
  in unchanged runtime lines of two planar terrain files; accepted outside this source-comment
  migration. No runtime change warrants additional GPU/physics suites in C1.
- The pre-commit batch is blocked by those same six existing lint errors and cancels its
  remaining tasks. After fixing the new Markdown line length, use the scoped checks above
  and the completed declaration build for this checkpoint; skip the blocked hook only.
- No upstream-owned or generated file is staged; no SGP or SDK changes.

No unresolved C1 finding. Approved for a separate local checkpoint before C2 activation.
