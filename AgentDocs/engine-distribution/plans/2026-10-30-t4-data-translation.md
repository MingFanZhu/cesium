# T4 Entity data, properties and graphics translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T3 checkpoint `1b84d87298`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

The rebuilt current inventory has 5,641 missing native fields. This phase selects 91 entity-data
roots with 1,471 missing fields and 993 distinct source texts: remaining Graphics, Property and position/material property variants, visualizers and
geometry updaters, CZML/KML/GPX/data-source interfaces, entity clustering/composites, KML tours
and export callbacks, reference frames, extrapolation and stripe orientation. MetadataClassProperty
belongs with structural metadata and is excluded. The test root list defines the exact batch.
Native geometry/numerics, widgets/input, metadata/providers and utilities follow after this phase.

## Implementation and gate

1. Read source-derived fields and author exact per-field Chinese catalogs. Repeated phrases
   require context review; source hashes alone do not establish semantic interchangeability.
2. Preserve time/definitionChanged/isConstant contracts, coordinate/reference frames, callback
   evaluation, interpolation/extrapolation, ownership, parent-child display behavior, clamp and
   terrain constraints, materials and geometry units, network/export and KML limitations.
3. Build docs, assert complete selected roots and zero stale/unused, compare all non-prose
   metadata/signatures/examples/URLs, add focused property/data assertions and one browser case.
4. Lint/format, review and checkpoint before inspecting subsequent geometry/remainder scope.
   No runtime, generator, public signature, SDK or native English source edits.

## Risks

A Property is time-evaluated rather than a static value. Preserve undefined-result and default
reference-frame semantics, collection ownership, event propagation, asynchronous load failure,
KML dependencies and limitations. Clarify copied or incorrect source prose only with current-code
evidence; retain protected literal code and link targets. Coverage counts never replace review.

## Outcome

Five catalogs add 1,471 records and complete all 1,904 fields of the selected roots. Coverage
is 11,124/15,294, leaving 4,170 missing with zero stale/unused. Context-specific overrides
remain ordinary per-symbol records; no fuzzy matching or generator changes. Current-code
evidence resolves copy errors in callbacks, events, sizing and geometry-updater descriptions.
See the [approved review](../reviews/2026-10-30-t4-data-translation.md). Commit before planning
the next geometry/numerics phase.
