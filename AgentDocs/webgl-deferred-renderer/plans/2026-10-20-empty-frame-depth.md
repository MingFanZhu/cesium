# Standalone Plan: Empty-frame native depth

## Metadata

- Type / Status: standalone / completed (engine correction; SDK integration pending)
- Owner / Reviewer: current architecture and execution task
- Date: 2026-10-20
- Parent: [completed extension](2026-10-13-webgl-deferred-renderer-extension.md)
- Patch: SGP-0046; no new public API or resource budget
- Review: [technical acceptance and SDK handoff](../reviews/2026-10-20-empty-frame-depth.md)

## Reproduced report and source facts

SDK reports native PostProcessStage depth retaining Planar buildings / terrain after
looking straight up on engine `5d5064c067`. The current branch is a descendant and
contains unrelated environment work; preserve those changes and the current checkout.
Scene clears hardware depth inside its frustum loop. Deferred begin releases owned
material targets when the frustum list is empty, but postprocessing continues to borrow
the native GlobeDepth depth/stencil attachment. Its frame clear only clears color/stencil.

## Work and validation

1. Add an engine GPU regression using a real Planar world and native PostProcessStage
   depthTexture, with visible geometry followed by a zero-frustum camera view.
2. Confirm failure before changing runtime. Clear native depth / stencil once for an
   empty command view through the existing Scene scheduling seam, before consumers.
3. Check first empty-frame output, consecutive empty frames, return to geometry,
   multi-frustum transition, and retained native attachment ownership. Normal nonempty
   frames must not gain a clear or geometry submission.
4. Run the bounded GPU regression and relevant deferred depth tests, static checks and
   SGP audit. Record technical evidence and SDK synchronization boundary in review.

No SDK-specific camera or private-depth workaround, no artificial frustum, no new
texture, shader, effect configuration or additional geometry pass. This restores an
existing native-depth contract; it does not retune environment appearance or reopen P4g.

## Completion

The two real-GPU regressions fail before the correction and pass afterward; 21 related
deferred regressions also pass. Runtime change is seven lines in Scene.js. Scoped
formatting / lint and upstream audit pass; full AgentDocs formatting retains 451
unrelated existing failures, with full markdownlint passing. The architecture review
accepts this engine correction for an isolated local checkpoint. SDK pin update and
Nanjing integration / visual verification remain explicitly pending in the review.
