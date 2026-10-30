# T6 Widget and input API translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T5 checkpoint `67269fc68a`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

Current report leaves 2,623 native fields missing. Select 69 roots with 832 missing fields,
621 distinct source texts, including 32 exact reusable translations. Cover Widgets, view models,
inspectors, screen-space events and camera controllers, binding interfaces, scene modes and
transforms, timeline/video controls and viewer mixins. The acceptance test root list defines
this batch. Utilities and metadata/providers remain reported for subsequent phases.

The apparent SceneGIS missing fields are JSDoc inheritance clones from native CustomShader
and PostProcessStage, with native source filename and inherits identity. They correctly use
external native translation; owned Chinese source fields remain excluded. No classifier change.

## Implementation and gate

1. Translate current source-hash records and review reused prose in its declaring context.
   Preserve protected markup, code, links, example bodies, signatures and canonical IDs.
2. Verify widget ownership/destruction, observable versus constant state, pointer positions,
   modifier/gesture semantics, camera angle/distance units, World conventions and interface
   contracts. Consult current source where inherited or copied prose is ambiguous.
3. Rebuild docs; require complete selected roots, zero stale/unused, unchanged non-prose metadata
   and examples, focused assertions and one nested browser page inspection.
4. Lint/format, review and commit this phase before elaborating the remainder. No runtime,
   public signature, generator, native source or SDK change.

## Risks

Do not treat view model properties as direct scene state or event state as repeated browser
input. Preserve horizontal/vertical deltas, touch transitions, pixel/radian/metre units and
resource ownership. Inherited native fields keep their original provenance even when the
published child name begins with SceneGIS. Do not silently omit these remaining fields.

## Outcome

Four catalogs add 832 records, completing 69 roots. Rebuilt coverage is 13,503/15,294, with
1,791 missing and zero stale/unused. Twenty-eight Node checks, a focused browser case and
non-prose metadata comparison pass. See the [review](../reviews/2026-10-30-t6-widget-input-translation.md).
No source/generator/runtime deviation. Commit before elaborating the next phase.
