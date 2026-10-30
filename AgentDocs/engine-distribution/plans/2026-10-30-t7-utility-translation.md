# T7 Utility and render-constant API translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T6 checkpoint `03dab19ec1`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

The current report leaves 1,791 native fields missing. Select 55 utility/render-constant roots,
509 missing fields and 377 distinct source texts (five exact reusable texts). Cover collections,
sorting, checks/errors, URI/query/base URLs, workers, feature detection, frame-rate monitoring,
pixel/index storage descriptions, blending/depth/stencil/culling and texture filtering enums.
Concrete roots live in the acceptance test. Remaining providers, metadata and specialized scene
APIs retain explicit gaps for subsequent phases.

## Implementation and gate

1. Translate source-bound prose with protected code, formulas, HTML and link targets unchanged.
   Recheck repeated English in context; only exact reviewed source texts can be reused.
2. Preserve comparator sign/ordering, byte/index/count units, mutable collection ownership,
   async task throttling, error meaning, URI encoding and WebGL constant/formula semantics.
   Read current implementation whenever source prose is ambiguous or copied incorrectly.
3. Rebuild docs; complete all selected roots and keep zero stale/unused. Verify all non-prose
   metadata, signature fields, examples and URLs unchanged. Add focused assertions and one
   nested browser inspection of task/error or texture-unit prose.
4. Lint/format, review and commit before elaborating the next phase. No source, generator,
   runtime, signature or SDK changes.

## Risks

Do not confuse task rejection with throttling, copied versus live arrays, shallow versus deep
clone, source versus destination blending, depth/stencil comparisons, CSS versus drawing-buffer
pixels, or local clocks with timestamps. Keep formulas and packed/indexed storage explicit.

## Outcome

Two catalogs add 509 records, completing all 515 fields of 55 roots. Coverage reaches
14,012/15,294 with 1,282 missing and zero stale/unused. Twenty-nine Node checks, focused nested
browser inspection and all-symbol non-prose comparison pass. See the
[review](../reviews/2026-10-30-t7-utility-translation.md). No scope deviation. Commit before
elaborating the next phase.
