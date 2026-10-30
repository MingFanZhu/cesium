# T2 Loading, providers and time translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T1 checkpoint `7141d62015`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

T1 leaves 8,900 native fields missing. Current report selects 60 roots with 1,699 missing fields
and 900 unique source texts: Resource/IonResource, request scheduling, Clock/JulianDate/
GregorianDate/LeapSecond/TimeInterval collections and standards, Event helpers, all remaining
native ImageryProvider/TerrainProvider/TerrainData/TilingScheme roots, map projections, Terrain,
sampleTerrain helpers and the createWorld imagery/terrain factories. The explicit reviewed-root
test list records this concrete batch; owned Chinese APIs remain excluded.

## Implementation and gate

1. Read exact current source prose and group repeated text. Author ordinary per-field records,
   reusing only exact unambiguous existing translations. No generator or source edits.
2. Preserve asynchronous result/cancellation semantics, throttling and retry rules, credentials,
   URI/query/header handling, time scales/leap seconds, interval endpoints, tile extents and
   sampling interpolation. Keep all links, literal code, names, types, defaults and units.
3. Build docs and verify complete selected roots, zero stale/unused, unchanged signatures,
   examples and URLs. Add narrow semantic assertions for loading/time contracts and inspect
   representative output with a focused browser case. Reuse complete link/hash checks.
4. Run scoped lint/format and AgentDocs checks, review and commit before T3 activation.

## Risks

Do not treat throttled undefined results as promises, promise rejections as empty successes,
UTC as TAI, excluded interval endpoints as included, or public service tokens as SDK behavior.
Provider source prose reflects this engine version; no remote service guarantee is inferred.
Clarify actual source typos only with current-code evidence. Other native fields stay reported.

## Outcome

Added 1,699 records in five ordinary catalogs, completing 2,361 fields across all 60 selected
roots. Native coverage is 8,093/15,294, with 7,201 missing and zero stale/unused. Reviewed
context-sensitive source duplicates individually. Actual code confirms corrections to template
merge semantics, vertex-count thresholds and inclusive date tolerance. See the
[approved review](../reviews/2026-10-30-t2-loading-time-translation.md). No scope deviation or
upstream-owned file change. Commit this phase before inspecting/activating T3.
