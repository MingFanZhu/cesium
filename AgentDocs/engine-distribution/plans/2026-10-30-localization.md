# Independent Chinese API documentation layer

- Type: standalone plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture and review: current task
- Architecture review: confirmed
- ADR: [0206](../../../Documentation/SceneGIS/Decisions/ADR-0206-documentation-localization.md)
- Parent: completed distribution extension; independent documentation increment
- SGP: none; no upstream-owned file modified

## Source facts and scope

The graph has no current documentation generator nodes; direct source inspection confirms
buildDocumentation copies native templates/config and composes the native publisher.
Public exports derive from generated engine/widgets barrels. JSDoc scans only their Source
trees; translations will live outside those trees in the newly approved generic roots.

Deliver generic extraction/merge tools, source-bound locale catalogs, glossary, UI translation,
English plus Chinese HTML/metadata, coverage/change reports, maintenance CLI and SDK guidance.
Seed priority native classes/members and all public extension entry descriptions. Preserve
complete English fallback; do not claim all API prose has been translated in this increment.
No source comment, runtime, SDK, package identity or native build target changes.

## Steps and acceptance

1. Record ownership and ADR before creating the new roots.
2. Implement generic prose-field extraction, source hash matching and protected token checks;
   fixture tests cover stale/missing/obsolete entries, overloads, parameter reordering and code.
3. Integrate locale builds before brand mapping; preserve actual native link allocation and
   semantic metadata. Add localized UI/search, locale links and source/report artifacts.
4. Add hand-authored Chinese priority translations keyed to extracted source and terminology.
5. Verify complete dual-locale docs, exhaustive anchors, Chinese search/type links and language
   switching, full distribution/types, scoped formatting/lint and ownership audit.
6. Write outcomes/deviations and review, then create one local checkpoint.

## Risks

Do not translate code or identifiers. Reject broken HTML/inline links. Hash changes must
not apply outdated text. Catalog omissions must appear in coverage and English fallback.
Keep native publisher mutation of params/examples isolated from serialized SDK metadata.
No generated output or machine paths belong in Git or AgentDocs.

## Outcome and implementation deviations

Delivered both approved generic roots, exact-source translation merging, protected markup/code,
locale UI, search, language switching, metadata, offline source inventory and pending CLI.
Initial catalog: 3,150 of 17,631 fields (17.9%), all 73 extension entry descriptions; 14,481
fields retain English. No stale or unused record. Each locale retains all 7,943 symbols.

Source inspection/tests also exposed integration annotations in prose, enum property aliases,
nested source AST in serialized enum metadata and a distinct native index layout. The owned
publisher cleans annotations, isolates mutable records and recursively sanitizes metadata;
both generated layouts receive language controls. No upstream comment or template was edited.

Full build/type and focused regression evidence are recorded in the
[approved review](../reviews/2026-10-30-localization.md). The catalog intentionally remains
partial; further Chinese prose is editorial maintenance through the same protocol.
