# C1: Chinese owned public JSDoc

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed
- Parent: [distribution extension](2026-10-29-extension.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned paths only

## Facts and scope

Current metadata identifies 923 owned doclets in 73 files, 2,336 prose fields and 1,864 unique
source texts. Graph discovery finds older runtime classes but not current doc builders, so
generator/data flow is inspected directly. Owned source is currently English by policy;
the owner explicitly authorizes changing public JSDoc to Chinese. Native comments stay intact.

Migrate public descriptions, params/properties, returns, exceptions, custom prose and captions.
Preserve tags, types, defaults, identifiers, inline links and example code. Existing verified
translations are reused; remaining owned prose is authored and reviewed. Leave private runtime
comments and algorithms alone. Remove redundant owned translation catalog records.

## Steps and acceptance

1. Update language policy/ADR and extension roadmap before source edits.
2. Capture source/runtime and declaration baselines. Associate each public prose unit with its
   actual JSDoc comment, migrate exact text and inspect unmatched ranges explicitly.
3. Classify source locale in the owned publisher. Bypass translation catalogs for owned Chinese
   fields, retain native English inventory/report, and mark direct sourceFields in metadata.
4. Rebuild docs/types; prove runtime tokens and public declaration signatures unchanged, every
   owned natural-language field is Chinese, links and native catalog behavior remain correct.
5. Review and checkpoint C1 before activating the single-edition C2 phase.

## Risks

JSDoc enum records may share references; metadata must remain isolated. Do not replace code
strings or example code when migrating prose. Do not count Chinese source text as missing English
translation. C1 temporarily retains the old output layout until the separately committed C2 gate.

## Outcome and gate

All 2,336 owned prose fields in 73 source files are Chinese, including parameter/return
descriptions and captions. VERSION adds one Chinese synthetic field. External catalogs remove
190 redundant records; the native inventory retains 15,294 fields with 2,960 translations,
12,334 missing, zero stale and zero unused. Owned fields have explicit sourceLocale/sourceFields
metadata and never enter translation fallback/report processing.

Native buildDocs, buildTs and SceneGIS docs pass. Executable ASTs in all 73 files, public
declaration signatures and 27 example programs are unchanged. Twenty-two Node checks pass.
Changed generator/test ESLint and scoped formatting pass. Source lint also reports six existing
new-cap errors in the two planar terrain files; those executable lines are unchanged and outside
this prose-only scope. Native comments and pipeline remain intact. No SDK or upstream-owned
file is modified. [Review](../reviews/2026-10-30-c1-chinese-source.md) approves the checkpoint.
