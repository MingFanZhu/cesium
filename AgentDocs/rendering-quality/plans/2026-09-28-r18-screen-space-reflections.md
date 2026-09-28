# Phase Plan: R18 Hierarchical Screen-space Reflections

- Plan type: `phase`; status: `completed`; owner visual acceptance: pending
- Author / architecture / execution: Current task
- Created: `2026-09-28`
- Parent: [rendering roadmap](2026-09-18-rendering-quality-extension.md)
- Decision: ADR-0097; no new upstream seam planned
- Architecture review: confirmed; [technical review](../reviews/2026-09-28-r18-screen-space-reflections.md)

## Scope and source facts

The owner prioritizes screen-space improvements over dynamic local probes and approves
SSR first. Retain R17 manual probes, defer diffuse GI and AO changes. Prefer published
GPU-vendor algorithms, pinned source revisions and explicit platform adaptations.

Current SSR traces both material lobes at full resolution with uniform projected steps,
then applies two spatial filters. Main MRT already supplies current opaque radiance,
linear eye depth and evaluated reflection rays/roughness; native compatibility paths
remain required. Water shares the original ray shader and must retain its behavior.

## Design and implementation

1. Adapt AMD FidelityFX SSSR cell-boundary traversal and reflection denoiser reprojection
   from SDK v1.1.4, pinned in ADR-0097. Ship MIT attribution with renderer assets.
2. Build six reduced nearest-depth textures using fragment passes, in addition to current
   full depth. Separate textures avoid WebGL framebuffer feedback and new upstream hooks.
3. Trace at selectable half/full resolution with full-depth intersection confirmation.
   Retain per-lobe hit distance and representative source pixel for reconstruction.
4. Filter reflection history at trace resolution. Reproject virtual reflected positions,
   validate receiver depth/normal/material, clip to current radiance statistics and reject
   misses immediately. Use double-precision camera-relative transforms and actual jittered
   projection. No per-object motion-vector claim.
5. Reconstruct full-resolution reflections with depth, normal and roughness weights.
   Preserve current IBL substitution, clearcoat and AO separation. No new geometry draw.
6. Add explicit resolution and temporal controls, reset API, independent example and
   Bistro controls. Verify resizing, toggling, camera motion, both worlds, orthographic
   and native compatibility paths, water regression and resource destruction.
7. Measure the isolated SSR GPU work and fixed Bistro frame cost before/after. Run bounded
   Specs, release/types, patch audit and self-review, then form one local checkpoint.

## Risks and exit conditions

Thin reflectors can be undersampled at half resolution; full resolution stays available.
Screen-space omissions remain IBL misses. No compute dispatch, stochastic GGX sampling,
object motion vectors, dynamic probes or complete FidelityFX port is claimed. Budget
history at trace resolution and document measured memory/performance. Visual owner
acceptance is separate from technical completion. Stop after sufficient evidence.

## Outcome

Implementation and bounded verification are complete: 39 GPU regressions, 13 release SSR
cases, two both-world E2E checks, release/types, lint and patch audit. Isolated SSR GPU cost
falls about 37% in Bistro and 62% in the reflection fixture on the measured device; full-frame
improvement is not claimed. Source-based self-review confirms no new upstream seam. Independent
example and Bistro quality controls are ready for owner visual acceptance. No subsequent phase
is active. See the review for memory, limitations and verification boundaries.
