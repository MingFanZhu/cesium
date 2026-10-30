# API reader layout cleanup

- Type: standalone plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Extension: [engine-distribution](../README.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; owned builder/UI/readme/tests only

## Source facts and requested behavior

The owned documentation builder copies the native template, injects coverageNotice above
every page, replaces the help strip and retains the JSDoc generator footer. The homepage
readme also repeats source-language/translation maintenance and metadata protocol explanations.
The owner requests clean API pages, with the report elsewhere and process details in readmes.

Remove the coverage injection, help strip and generator footer in the copied layout templates.
Remove obsolete UI strings. The homepage becomes a brief search entry with a Documentation
resources list (report, metadata, search index, distribution guide). Translation/source-language
policy and maintenance remain in Documentation/i18n/README.md, not the API reader page.
Native templates, source comments, translation data, report generation and API metadata stay intact.

## Implementation and bounded verification

1. Update owned builder, UI/homepage data and maintenance readme; update presentation assertions.
2. Rebuild with buildSceneGISDocs. Require no banner/help/footer on every generated page and
   the report link only on the homepage. Compare metadata/source/report against prior output.
3. Run documentation Node suites and the relevant root/nested docs browser cases; inspect the
   homepage and a symbol page screenshot. No runtime/type/GPU rebuild is needed for layout-only edits.
4. Lint/format, record review and local checkpoint. No SDK/upstream/generated-file edits.

## Outcome

Copied-template presentation and homepage/readme separation now match the requested layout.
Docs build, 36 Node checks and three focused browser cases pass; all API/translation JSON stays
byte-identical. Screenshots confirm clean symbol pages and the homepage resource links. See the
[review](../reviews/2026-10-30-doc-reader-layout.md). No implementation deviation.
