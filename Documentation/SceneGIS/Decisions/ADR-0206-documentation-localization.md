# ADR-0206: Independent source-derived API documentation localization

- Status: accepted and implemented; source-language and bilingual delivery rules superseded by
  [ADR-0207](ADR-0207-chinese-source-api-documentation.md)
- Date: 2026-10-30
- Owner: Architecture Agent (current task)
- Related: [ADR-0205](ADR-0205-scenegis-distribution.md),
  [engine-distribution](../../../AgentDocs/engine-distribution/README.md)
- Upstream patches: none; integrate through the owned documentation publisher

## Context and source facts

Native JSDoc recursively parses engine and Widgets Source, retains custom cesiumTags,
and allocates links in its publisher. The owned distribution publisher already selects
public roots and maps brand presentation. Translating upstream comments would create a
large maintenance diff. Translation is independent of both runtime source and branding.

## Decision

Approve two owned roots outside runtime discovery: Documentation/i18n for locale data,
glossary and UI strings; scripts/docs-i18n for generic Node/JSDoc tooling and tests.
No runtime import, workspace, external translation service or SDK dependency is added.
The tool accepts doclets and locale catalogs without knowing the distribution namespace.

Identify a translation by original longname, field selector and normalized-source SHA-256.
Named parameter/property selectors survive ordering changes; source hashes distinguish
overloads and detect changes. Translate prose, parameter/return/property descriptions,
custom performance/experimental prose and example captions. Preserve identity, type data,
defaults, link targets, HTML markup and example code. Duplicate or malformed records and
markup/link/code corruption fail the documentation build. Missing/stale records retain
source text with a generated report; obsolete records are reported separately.

Apply translations before branding and native rendering. Keep the complete English tree
at Documentation and emit a complete zh-CN tree below it. Both include locale-tagged
doclets/index metadata with identical identities and relative URLs. Publish locale
discovery, translation coverage, and a canonical source inventory for offline maintenance.
The initial Chinese catalog covers priority APIs and extension entry points; untranslated
fields remain visibly identified as English. Full translation is incremental editorial work.

## Validation and upgrade boundary

Test named fields, overloads, missing/stale/obsolete records, duplicate rejection, protected
markup and code, captions, and namespace independence. Build both locales from source;
verify public coverage, every page/anchor, semantic metadata preservation, localized sidebar name filtering,
type links and locale navigation in a real browser. Run the corresponding full distribution
and type checks once. No native file needs modification or SGP for this addition.

Keep source hashes tied to unbranded English prose, never generated HTML. On upgrades,
re-extract the inventory and review changed records and native template labels. Translation
data and tooling are source-controlled; Build output and pending catalog reports are not.
