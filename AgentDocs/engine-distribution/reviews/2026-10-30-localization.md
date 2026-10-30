# Independent documentation localization review

- Type: standalone review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [localization plan](../plans/2026-10-30-localization.md)
- ADR: [0206](../../../Documentation/SceneGIS/Decisions/ADR-0206-documentation-localization.md)
- SGP: none; no upstream-owned file modified

## Findings

| Finding                                                                                       | Severity | Owner           | Disposition                                                                             |
| --------------------------------------------------------------------------------------------- | -------- | --------------- | --------------------------------------------------------------------------------------- |
| Source integration markers appear in native parameter prose and would enter translation units | low      | Execution Agent | fixed: prose-only cleanup before extraction/branding; source inventory assertion passes |
| Comparing sorted HTML tokens accepts reordered closing tags with broken nesting               | medium   | Execution Agent | fixed: retain markup order, with invalid nesting/attribute/link/code fixtures passing   |

| Native enum property records alias standalone member doclets, leaking locale state and allowing a field to be processed twice | medium | Execution Agent | fixed: clone mutable prose records before applying translations; shared-reference fixture and all-signature comparison pass |
| Nested enum metadata retained code AST from native doclets | medium | Execution Agent | fixed: recursive sanitization; metadata walk validates both complete locales |
| Native indexLayout uses mainIndex instead of main, omitting language control and stopping search initialization | medium | Execution Agent | fixed: inject both copied layout variants; index DOM assertions and both real-browser doc cases pass |

## Architecture assessment

The two generic roots are authorized in Architecture and ADR-0206 before implementation.
Translation extraction/merge has no engine or brand dependency. Source hashes refer to raw
English JSDoc prose and named parameter selectors, not HTML pages or translated display names.
The owned publisher translates before branding and keeps actual native URL/anchor allocation.
SDK metadata is serialized before native templates mutate nested params/examples.

Partial translation is explicit. Initial catalogs contain 3,150 fields, including descriptions
of all 73 public extension roots and detailed wind display controls; untranslated text retains
English and per-doclet coverage metadata. No automated translation service or runtime check.

## Validation and gate

- Complete buildSceneGIS passed, including native buildTs and strict declaration compilation.
- Root TypeScript build-script check passed. Generic/data/distribution tests: 24 passed;
  covers all public extension roots, every page/anchor in both locales and signature/code identity.
- Six runtime/browser cases passed: root/nested IIFE/ESM, both Worlds and destroy, real
  Worker/Draco WASM/image loads. Two final documentation browser cases passed, including
  Chinese prose search, same-symbol language round-trip, anchors and type links; screenshot inspected.
- Pending CLI generates exactly 14,481 untranslated candidates. No stale/unused translation.
- Scoped ESLint/Prettier, markdownlint and upstream audit verified before checkpoint.
  Whole AgentDocs retains pre-existing formatting debt; changed extension records are formatted.
- No upstream-owned files changed, no SGP required, no generated output staged.

Gate approved for one local checkpoint. Remaining limit is explicitly partial Chinese prose;
English fallback and source-bound review reports remain available. Native JSDoc/type warnings
from the existing engine baseline are unchanged. No runtime or SDK integration risk is added.
