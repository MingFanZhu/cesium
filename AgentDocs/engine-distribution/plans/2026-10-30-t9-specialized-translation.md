# T9 Remaining specialized API translation

- Type: phase plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; catalog-only scope
- Parent: [translation program](2026-10-29-extension.md)
- Prerequisite: T8 checkpoint `1910049d45`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none anticipated; owned catalogs/docs/tests only

## Current facts and scope

Current report leaves 710 native fields missing. This phase covers every remaining field:
66 roots, 550 distinct source texts, including 36 exact reusable texts. Cover buffer-based
primitives, 3D Tile content/point features, voxel providers/rendering, panorama, I3S, Gaussian
splats, expressions, credits, debug helpers and remaining scene enums/GeoJSON representations.
The test root list is the explicit scope. This completes catalog coverage, not the final
distribution acceptance audit; perform that bounded final gate after the phase checkpoint.

## Implementation and gate

1. Translate source-bound prose and review all reused text in context. Preserve code, examples,
   formulas, literal link/HTML targets, canonical identities, signatures and types.
2. Verify coordinate/projection and sampling units, buffer dirty/update/removal contracts,
   frame/time/pause semantics, array index/layout, loading events, async tile results and
   resource ownership. Read current code where original prose is ambiguous or copied.
3. Rebuild docs and require missing/stale/unused all zero, and no owned-source provenance
   leakage. Verify unchanged non-prose metadata/examples/URLs; add focused semantic checks
   and browser inspection of specialized geometry/voxel metadata.
4. Lint/format, review and commit. Then activate a separate final delivery audit using the
   current full distribution/build/type/browser commands. No runtime, source, generator,
   signature, SDK, dependency or service-configuration changes in this editorial phase.

## Risks

Keep active buffer ranges separate from capacity, hardware instance indices from features,
voxel cell centres from primitive bounds, I3S node loading from scene selection and display
opacity from physical concentrations. Shared English must not perpetuate copied class names,
incorrect units or ownership claims. Zero counts alone cannot prove editorial correctness.

## Outcome

Four catalogs add all 710 final records, completing all 778 fields of 66 roots. Rebuilt native
coverage is 15,294/15,294 with missing/stale/unused all zero. Thirty-two Node checks, focused
browser inspection and all-symbol non-prose comparison pass. See the
[review](../reviews/2026-10-30-t9-specialized-translation.md). Only editorial clarifications
and complete-coverage test updates accompany the new records. Commit before final delivery audit.
