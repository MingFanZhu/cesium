# T7 Utility translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T7](../plans/2026-10-30-t7-utility-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and resolved findings

Two catalogs add 509 records, completing all 515 fields of 55 selected roots. Reviewed the five
exact reused texts and shared comparator, texture/enum and error contexts. Protected formulas,
code, HTML and link targets remain intact. Live array, shallow clone, first-object merge
precedence, bitwise insertion index, timestamp base, render comparison and filtering semantics
remain explicit.

Current-code evidence corrects inaccurate or copied native wording:

- destroyObject replaces enumerable functions (including enumerable inherited methods), sets
  isDestroyed and returns undefined; it does not delete all object properties or release native
  resources itself. Caller destroy methods own resource release. Chinese distinguishes these.
- FrameRateMonitor.update raises lowFrameRate/nominalFrameRate and does not redirect the page.
  Retain the protected redirectOnLowFrameRateUrl token in a clarification of that source error.
  Pause/unpause calls are counted; quiet/warmup/sampling windows retain seconds as their unit.
- TaskProcessor.scheduleTask checks activeTasks >= maximumActiveTasks; reaching the limit
  immediately returns undefined, without queueing or returning a rejected task Promise.
  Transferable data is transferred rather than copied; Worker creation remains lazy.
- subdivideArray uses ceil on remaining elements/count, so chunk sizes need not be identical.
  formatError copied the itemToFind parameter description: its individual record now identifies
  an error object. defined explicitly excludes undefined and null. GUID prose does not turn
  random generation into an absolute uniqueness guarantee.
- Comparator return prose retains all repeated code operands. FrameRateMonitor.fromScene
  retains both class link occurrences; protected-token checks caught omissions before the build.

The browser fixture initially assumed a dedicated texture enum page. Current metadata places
this constant enum in global.html; corrected the fixture to that actual root anchor. Existing
canonical URLs/signatures were preserved rather than changing generation in an editorial phase.

## Validation and gate

- Docs build passes: 14,012/15,294 translated (91.6%), 1,282 missing, zero stale/unused.
- Twenty-nine Node checks pass, including all 488 reviewed roots, task backpressure, live-array
  ownership, timestamp units, stencil comparisons, premultiplied alpha and mipmap requirements.
- Focused nested browser case passes without resource/page errors. TaskProcessor displays
  undefined backpressure and transfer semantics; screenshot inspection confirms the complete
  Chinese texture-filter table with unchanged names and numeric types.
- All 7,943 symbols preserve non-prose metadata, signatures, example bodies and URLs.
- Scoped ESLint/Prettier and Markdown checks pass. Whole-tree AgentDocs formatting retains
  only 623 inherited warnings outside this extension. No generated artifacts committed.

No unresolved new finding. Approved for the T7 local checkpoint. Remaining metadata/providers
and specialized scene APIs stay in the report; the full translation goal remains active.
