# T11 Reference and demo prose coverage

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: approved corrective scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T10 audit checkpoint `4a01badec1`
- Finding: [T10 P1](../reviews/2026-10-30-t10-translation-delivery-audit.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; generic owned tooling, catalogs, tests and docs only

## Current facts and scope

The audit found native see/demo prose outside visitProse, including CornerType demonstration
sentences and ImageryLayer usage guidance. The publisher retains these tags and maps their brand
presentation, but the source inventory never offered them for translation. Current tracked-field
zero counts therefore understate the natural-language scope. Owned see fields are pure symbol
references; no additional owned-source translation is currently needed.

Extend the existing generic extractor rather than adding a separate translation route. Cover
see/demo array entries containing prose or explicit display labels; preserve reference-only
symbols, URLs, link-without-label entries and accidentally attached code comments verbatim.
Add numeric see/index and demo/index selectors to the existing source-hash contract. Preserve
targets, markup, literal code, examples, metadata identity, types and signatures. Clone these
arrays alongside other mutable prose arrays to avoid alias leakage.

## Steps and gate

1. Add narrow reference-prose detection/visitation and fixtures for translated labels, pure
   references, multiline guidance/code comments, source changes and protected targets.
2. Rebuild the source inventory, author every newly exposed native record, inspect Chinese
   source exclusion and update documented selectors/counts. Audit remaining doclet fields:
   defaults, types, IDs, version and code are intentionally literal.
3. Build the full artifact; require all exposed fields translated with no stale/unused entries.
   Run complete focused Node/type/browser checks and inspect demo/see prose in HTML/metadata.
   Compare all non-prose fields with the pre-T1 snapshot using the corrected field visitor.
4. Close T10 P1 with evidence, record review, lint/format and commit. Only then complete the
   persistent goal after a fresh requirement-by-requirement audit.

## Boundary amendment

The earlier catalog-only roadmap is amended for this confirmed omission. The shared extractor
change is an owned build-time seam; no runtime, native JSDoc, template, namespace, public engine
signature, SDK or upstream file change. Existing raw native link/format limitations remain.

## Outcome

The extractor exposes and translates 229 additional reference/demo units, reaching 15,523 native
fields with missing/stale/unused all zero. Full branded build, 38 Node checks and 19 browser
cases pass; all 7,943 symbols preserve non-prose metadata, examples and URLs against pre-T1.
Owned source fields remain 2,337. T10 P1 is resolved. See the
[final review](../reviews/2026-10-30-t11-reference-prose.md). No runtime/native/SDK deviation.
