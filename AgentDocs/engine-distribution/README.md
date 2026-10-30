# SceneGIS engine distribution

## Metadata

| Field                  | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Extension slug         | `engine-distribution`                                                             |
| Status                 | `completed`                                                                       |
| Planning model         | `extension`                                                                       |
| Active extension plan  | None; latest [Distribution](plans/2026-10-29-extension.md)                        |
| Current phase          | Environment API boundary documentation completed                                  |
| Active standalone plan | None; latest [Environment boundary](plans/2026-10-30-environment-api-boundary.md) |
| Active phase plan      | None; latest [T11](plans/2026-10-30-t11-reference-prose.md)                       |
| Architecture contact   | Architecture Agent (current task)                                                 |
| Execution contact      | Execution Agent (current task)                                                    |
| Last updated           | 2026-10-30                                                                        |

## Scope

Single-source SceneGIS browser/ESM distribution, bundled resources, declarations,
complete source-derived static API documentation and SDK-consumable metadata.
No SDK edits, internal package renaming, duplicate implementation, runtime version lock,
automatic compatibility checks or registry publication.

## Engineering links

- Source: `scripts/scenegis/`, `scripts/build.js`, `gulpfile.js`, Core/buildModuleUrl.js.
- Tests: owned Node build tests and `Specs/e2e/scenegis-distribution.spec.js`.
- Branch: `feature/scenegis-distribution`.
- ADR: [ADR-0205](../../Documentation/SceneGIS/Decisions/ADR-0205-scenegis-distribution.md).
- SGP: `SGP-0073`, `SGP-0074`.
- Open discussion: none. No separate review agent requested.

## Current language delivery

[ADR-0207](../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
implements Chinese owned public JSDoc and one Chinese documentation edition.
[C1](plans/2026-10-30-c1-chinese-source.md) is [reviewed](reviews/2026-10-30-c1-chinese-source.md)
and committed as `05362428b6`; [C2](plans/2026-10-30-c2-chinese-edition.md) is
[reviewed](reviews/2026-10-30-c2-chinese-edition.md) and complete.

All 73 owned API source files maintain Chinese prose directly. The 2,337 published owned
fields include synthetic VERSION and bypass external translation. Native English comments
remain intact; independent catalogs cover all 15,523 native fields.
Missing/stale/unused are all zero; pure numeric/formula descriptions remain literal. Each build overwrites source
inventory/report without altering maintained catalogs. Historical bilingual delivery in
[ADR-0206](../../Documentation/SceneGIS/Decisions/ADR-0206-documentation-localization.md) and
[localization review](reviews/2026-10-30-localization.md) is superseded by C1/C2.

## Latest environment support boundary

[Environment boundary](plans/2026-10-30-environment-api-boundary.md) is completed and
[reviewed](reviews/2026-10-30-environment-api-boundary.md). Owned public JSDoc and sixteen
native symbol descriptions explain the deferred environment gates, retained Fog/lighting
roles and maintained replacement. Product notices are appended after native translations,
outside catalogs/upstream comments. Docs build, 37 Node checks and the root/nested browser
case pass; translation inventory/report and executable source remain unchanged. No new SGP
or runtime/SDK edit; historical atmosphere maintenance issues retain their original status.

## Latest reader layout

[Reader layout](plans/2026-10-30-doc-reader-layout.md) is completed and
[reviewed](reviews/2026-10-30-doc-reader-layout.md): remove translation notices and help/generator
footers from API pages. The report link lives in homepage resources; maintenance details stay in
Documentation/i18n/README.md. Docs build, 36 Node checks and three focused browser cases pass.
All API/translation JSON files are byte-identical; no upstream/runtime/SDK edit.

## Latest maintenance

[Sidebar name filtering](plans/2026-10-30-sidebar-search.md) is completed and
[reviewed](reviews/2026-10-30-sidebar-search.md): only names in the generated navigation match.
Full SDK metadata remains intact; translation review is build-time source-hash comparison.
Nine metadata tests, ten translation fixtures and two focused browser cases pass.
No upstream or runtime changes.

[Asset directory correction](plans/2026-10-29-asset-directories.md): completed and
[reviewed](reviews/2026-10-29-asset-directories.md). SGP-0074 filters directory entries in the
shared asset stream. Rebuilt artifact has zero empty directories; 8 Node and 7 browser tests pass.

## Final translation delivery

[T11](plans/2026-10-30-t11-reference-prose.md) and its
[final review](reviews/2026-10-30-t11-reference-prose.md) complete the continuous goal:
15,523 native fields covered, zero missing/stale/unused, 2,337 owned Chinese source fields,
533 pages and 7,943 symbols. Full branded build, 38 Node checks and 19 browser cases pass.
The retained [T10 finding](reviews/2026-10-30-t10-translation-delivery-audit.md) is resolved
by adding 229 see/demo prose fields to the same independent source-hash route.
No unresolved new review, SDK/runtime/upstream edit or generated artifact commit remains.

## Latest specialized phase

[T9](plans/2026-10-30-t9-specialized-translation.md) is completed and
[reviewed](reviews/2026-10-30-t9-specialized-translation.md): 710 new records complete all
778 fields of 66 specialized roots. Native coverage is complete; 32 Node checks and a focused
browser case pass. Final full-distribution/type/browser acceptance remains pending after the
T9 checkpoint. No runtime, source, generator, upstream or SDK changes.

## Latest metadata-provider phase

[T8](plans/2026-10-30-t8-metadata-provider-translation.md) is completed and
[reviewed](reviews/2026-10-30-t8-metadata-provider-translation.md): 572 new records complete
all 641 fields of 52 metadata/provider roots. Native coverage is 95.4%; 30 Node checks and a
focused nested browser case pass. Storage, covariance units, availability and retry semantics
reach Chinese HTML/metadata. No runtime, source, generator, upstream or SDK changes.

## Latest utility phase

[T7](plans/2026-10-30-t7-utility-translation.md) is completed and
[reviewed](reviews/2026-10-30-t7-utility-translation.md): 509 new records complete all 515 fields
of 55 utility/render-constant roots. Native coverage is 91.6%; 29 Node checks and a focused
browser case pass. Task limits, collection ownership, formulas and mip filtering reach Chinese
HTML/metadata. No runtime, source, generator, upstream or SDK changes.

## Latest widget-input phase

[T6](plans/2026-10-30-t6-widget-input-translation.md) is completed and
[reviewed](reviews/2026-10-30-t6-widget-input-translation.md): 832 new records complete 69 roots,
including native fields inherited by owned classes. Native coverage is 88.3%; 28 Node checks and
a focused nested browser case pass. Cancellation, event state and controller unit semantics
reach Chinese HTML/metadata. No source, generator, runtime, upstream or SDK changes.

## Latest geometry phase

[T5](plans/2026-10-30-t5-geometry-translation.md) is completed and
[reviewed](reviews/2026-10-30-t5-geometry-translation.md): 1,547 new records complete all
2,081 fields of 95 geometry/numerical roots. Native coverage is 82.8%; 27 Node checks and a
focused browser case pass. Units, packing, winding, spline timing and verified geometric
constraints reach Chinese HTML/metadata. No source, generator, runtime, upstream or SDK changes.

## Latest entity-data phase

[T4](plans/2026-10-30-t4-data-translation.md) is completed and
[reviewed](reviews/2026-10-30-t4-data-translation.md): 1,471 new records complete all
1,904 fields of 91 entity-data roots. Native coverage is 72.7%; 26 Node checks and a focused
browser case pass. Property evaluation, events, frames, extrapolation and reusable clustering
retain their contracts. No source, generator, runtime, upstream or SDK changes.

## Latest rendering phase

[T3](plans/2026-10-30-t3-rendering-translation.md) is completed and
[reviewed](reviews/2026-10-30-t3-rendering-translation.md): 1,560 new records complete all
1,713 fields of 80 rendering roots. Native coverage is 63.1%; 25 Node checks and one focused
browser case pass. Pixel sizing, texture ownership, clipping logic and corrected source
semantics reach HTML and metadata. No runtime, generator, upstream or SDK changes.

## Latest loading and time phase

[T2](plans/2026-10-30-t2-loading-time-translation.md) is completed and
[reviewed](reviews/2026-10-30-t2-loading-time-translation.md): 1,699 new records complete all
2,361 fields of 60 resource/time/provider roots. Native coverage is 52.9%; 24 Node checks and
the focused nested browser case pass. Context-sensitive provider names, scheduling, time scales,
interval endpoints and child masks are verified. No upstream/runtime/generator/SDK changes.

## Latest foundation phase

[T1](plans/2026-10-30-t1-foundation-translation.md) is completed and
[reviewed](reviews/2026-10-30-t1-foundation-translation.md): 2,107 new records, all 2,858 fields
of 20 foundation roots covered. Native coverage is 41.8%; 23 Node checks and the focused browser
case pass. Runtime, source, generator, code and SDK remain unchanged.

## Earlier native translation batch

[Native translation batch](plans/2026-10-30-native-translation-batch.md) is completed and
[reviewed](reviews/2026-10-30-native-translation-batch.md). Added 1,327 entries and completed
all 1,476 fields of 18 common scene/camera/imagery/tileset/primitive/entity/data-source roots.
Native coverage rises from 19.4% to 28.0%; the source-derived report keeps the remaining gaps.

Docs-only build, 22 Node checks and three focused browser docs cases pass. All non-prose
metadata, types, examples and URLs remain unchanged. Verified source typos are clarified only
in Chinese; upstream source, generator, runtime and SDK stay intact. No SGP or new open finding.

## Current handoff

Generate the complete artifact with `npx gulp buildSceneGIS`; docs-only with buildSceneGISDocs.
One Chinese edition lives at Documentation/index.html with 533 pages and 7,943 symbols.
SDK consumes root api-doclets.json/api-index.json with output locale and per-symbol sourceLocale;
sourceFields identify direct Chinese prose and translatedFields/fallbackFields identify native
translation coverage. No locale discovery or duplicate English tree remains.

Full build, strict declarations, 38 Node checks and 19 browser cases pass, including root/nested
resources, both Worlds, Chinese docs, name-only filtering, links and lifecycle.
[SDK guide](../../Documentation/SceneGIS/Distribution.md) and
[translation maintenance](../../Documentation/i18n/README.md) cover consumption and source-hash
updates. T1–T11 are reviewed and independently checkpointed. The current-source translation
program is complete; future source changes must satisfy the complete-coverage checks again.
