# Phase Plan: A17-G Far Cloud Depth Continuity

## Metadata

- Type: `phase`; status: `completed`; created / updated: `2026-09-11`
- Owner: Architecture Agent / Execution Agent; design: `confirmed`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Base: completed A16 `93540ca075`; upstream-owned changes / new SGP: none
- Diagnosis: [far cloud bands](../discussions/2026-09-11-far-cloud-bands.md)
- Review: [A17 review](../reviews/2026-09-11-a17g-far-cloud-depth.md)
- Decisions: ADR-0043 depth reconstruction, ADR-0048 temporal policy

## Confirmed source and design

At a 200 km camera with a native near receiver holding currentFrustum.near near
0.2 m, the Globe sample reproduces the owner's broad horizontal empty bands.
CloudFS and ResolveFS already use precise raw-depth native overloads for medium,
but high/low and all Globe AerialFS still reverse log depth into float32
perspective depth before inverse projection. That round trip creates stepped
receiver distances and false cloud occlusion. Replacing only the Globe AerialFS
expression in the medium reproduction removes the bands.

Use `czm_screenToEyeCoordinates(cloudCoordinates, rawDepth)` for every Globe
CloudFS quality and `czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth)` for
Globe ResolveFS and AerialFS. Preserve native encoding selection, clear-depth
gating, Orthographic linear behavior, sample coordinates and receiver precision.
Planar, temporal policy, sample budgets, resources, passes and A16 stay unchanged.

## Implementation and validation

1. Apply the three narrow SceneGIS-owned GLSL corrections. Normal shader
   generation through focused Karma tests; no manual generated-file edits.
2. Add actual-GPU far-depth coverage distinguishing the former expression,
   retaining foreground occlusion and linear/Orthographic behavior. Verify
   producer/resolve distances and final composition, not just a helper formula.
3. Retain the existing far opaque Globe aerial/fog regression. Reuse prior
   lifecycle evidence because resource/allocation code is unchanged.
4. Inspect corrected source in the isolated native reproduction, report bounded
   shader cost and release all temporary programs, targets and near geometry.
5. Scoped lint/format, required AgentDocs checks and whitespace/ownership review.
   Public API/build code is unchanged; no full types/release matrix is needed.

## Gate and handoff

The original owner tab is unavailable through the current browser connection;
reproduction uses an isolated sample, not a claimed restoration of that tab.
Final original-view quality remains an owner judgment. Independent local phase
checkpoint follows implementation, verification and review; no successor or
Planar work is activated.

Implementation and Architecture code review are complete. The new far-cloud
GPU fixture passes (41.548 s), as does the retained native far opaque aerial/fog
fixture (25.431 s). Corrected native high/medium reproduction has no horizontal
empty bands. Final-composite paired median cost increases by 0.021504 ms;
resource and validation limitations are in the review. Static checks pass
within scope, with the known 16 unrelated global AgentDocs format failures.

## Project-owner acceptance — 2026-09-11

The owner confirms “通过” after the corrected build and visual handoff.
Architecture closes A17-AR-002 and the phase using the existing two passing GPU
regressions, source review and bounded cost evidence. This closure changes only
acceptance records; no product modification or GPU/browser rerun is needed.
The independent local commit containing this record includes the three GLSL
corrections, Spec and ADR/AgentDocs changes. Upstream-owned/generated changes
and new SGP are zero. No push or successor activation; P1 remains deferred.
