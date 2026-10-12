# WebGL shared-fix backport

- Type / Status: standalone / completed
- Owner / Reviewer: current architecture and execution task, self-review
- Created: 2026-10-12
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md)
- Authorization: owner selected WebGL quality first and explicitly confirmed `scenegis/develop` as the new branch base.
- Baseline: `2f6d4ce30b`; branch: `feature/webgl-rendering-quality`
- Source: `feature/webgpu-renderer` at `ec5f98014c`; its uncommitted P4n remains preserved and deferred, with visual-quality findings open.
- Architecture review: confirmed; selective behavior fixes, no backend/API expansion.
- Decisions: ADR-0085, ADR-0045, ADR-0046, ADR-0153; patches SGP-0015, SGP-0043.

## Scope and source evidence

1. `122ba3dd1d`: authored Model > Scene > procedural IBL precedence, live SH replacement and immediate withdrawal of changed Scene cube maps. Port the native pipeline, owned physical-light guard and only the relevant Scene hunk.
2. `4ee99433ab`: Globe background/stars no longer apply height fog before the existing final Aerial pass. Planar ordering remains intact.
3. `5bede894ca`: cloud shell intersections retain local metric precision, constant RGB channels tolerate floating-point residue in history clipping, and full-resolution reconstruction uses exact fragment centers.
4. `ec5f98014c`: HeightmapTerrainData exposes mesh readiness to the existing native parent/descendant terrain state machine. Port its owned native regression.

Do not cherry-pick the mixed commits. Exclude WebGPU renderer/async camera/resource seams, WGSL-only fixes, helper extractions, GI work, test-page API adapters and unrelated test-fixture changes. Preserve the existing R22 and older visual-review status; this maintenance checkpoint does not accept those pictures.

## Implementation and bounded verification

- Apply the exact independent hunks and record original provenance in the patch manifest / existing decisions.
- Reuse the native portions of source-priority and cloud numeric tests without WebGPU dependencies. Verify live pixel response, clearing and destruction; validate shell intersections against independent double-precision results.
- Run the native missing-descendant regression and affected native terrain / IBL Specs. Exercise the production cloud resolve and Globe fog path with focused GPU regressions.
- Build development/release and types for the changed native seam and shaders; run scoped lint, formatting and patch audit. Use this checkout's bundle and dependencies, not the original server.
- Review source independence, resource/pass budgets and test evidence; create a local Chinese checkpoint. No push. Afterward establish a fixed WebGL Bistro baseline before any new quality implementation.

## Risks and exit gate

This only transfers existing bug fixes. It does not claim that the Bistro visual gap, GI quality or historical cloud strict-validation fixture failures are resolved. No new textures, passes, geometry or history buffers are introduced; cloud arithmetic changes retain existing sample budgets. Technical evidence and unresolved limitations must be recorded before checkpointing.

## Completion

Implementation and architecture/code self-review are complete.
[Review](../reviews/2026-10-12-webgl-fix-backport.md) records 181 native cases, six GPU/browser
cases, development/release builds, type generation, `tsc` and the ownership audit.
The cloud fixture now pins the actual trace map as well as the composition map and allows
measured synchronous shader compilation to finish before teardown. No product tolerance
or sampling budget changed. Preserve fresh-install tooling and historical visual/fixture
limitations in the review; form the local migration checkpoint without activating a new phase.
