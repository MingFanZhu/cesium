# T8 Metadata and provider API translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T7 checkpoint `9af3d7e757`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

Current report leaves 1,282 native fields missing. Select 52 roots with 572 missing fields,
419 distinct source texts and 23 exact reusable texts. Cover structural metadata/schema/enums,
local geopositioning/correlation, geocoder/provider services, availability/discard/error helpers,
time-dynamic imagery and data-source factory functions. Acceptance test root list defines the
batch. Specialized scene, voxel, buffer, panorama and I3S APIs remain for the next inventory.

## Implementation and gate

1. Translate exact current-source prose, preserving canonical identity, protected code, markup,
   links, example bodies, types, signatures, byte widths, units and enum values.
2. Check required/default/noData semantics, normalization and scale/offset order, geolocation
   and covariance units, level inclusivity, request throttling/retry and service-result contracts.
   Review exact reuse in context and inspect current source wherever prose is ambiguous.
3. Rebuild docs and require complete selected roots, zero stale/unused, unchanged non-prose
   metadata/examples/URLs, focused semantic assertions and one nested browser inspection.
4. Lint/format, review and local commit before the next phase. No native source, generator,
   runtime, signature, SDK, dependency or service-configuration changes.

## Risks

Do not turn metadata min/max into enforced validation, confuse normalized data with raw data,
or treat source uncertainty/correlation as display geometry. Preserve provider availability
and asynchronous result meanings; translate current engine docs without claiming current
external-service behavior beyond their implemented contracts.

## Outcome

Three catalogs add 572 records, completing all 641 fields of 52 roots. Rebuilt coverage is
14,584/15,294, with 710 missing and zero stale/unused. Thirty Node checks, focused browser
inspection and non-prose comparison pass. See the
[review](../reviews/2026-10-30-t8-metadata-provider-translation.md). No scope deviation.
Commit before elaborating the remaining specialized API inventory.
