# Lens texture follow-up review

- Type: code/architecture review; status: approved for checkpoint, owner visual acceptance pending
- Created/updated: 2026-09-29; reviewer: current task, self-review
- Target: lens follow-up after 279103d298
- Parent: [plan](../plans/2026-09-29-lens-texture.md); [ADR-0105](../../../Documentation/SceneGIS/Decisions/ADR-0105-rain-surface-and-lens-details.md)
- Upstream-owned files changed: none; SGP: none

## Findings

| ID  | Severity | Status   | Evidence / disposition                                                                                                                                                                                                                                                                                                                                  |
| --- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | medium   | fixed    | Native collection removal clears `_textureCache` before stage destruction, bypassing image texture release. Subclass releases its own sprite before native destruction. GPU test verifies disable/re-enable and Scene teardown, without upstream changes.                                                                                               |
| L2  | medium   | fixed    | Refraction-only preview did not read as lens beads; using the sprite's asymmetric RG warp as a normal misplaced the highlight. A separate cap normal now samples visible scene color for reflection. Owner rejected the fixed bright glint; that synthetic light is removed. Flat-color GPU test forbids added highlights and black-scene illumination. |
| L3  | note     | accepted | Reflection uses visible color as an artistic proxy. It depends on screen contents and cannot reproduce the commercial reference's complete appearance. No fluid collision/merging or capture is claimed. Owner visual acceptance remains pending.                                                                                                       |

## Validation

- Chrome Headless 154 / Windows: three RainLensStage GPU Specs pass in development and release with WebGL validation. Tests cover identity, alpha, flat-background/no-light behavior, time, reuse, lazy loading and disposal.
- Both Globe and Planar rain-details Playwright tests pass, including independent controls and teardown. Desktop inspection shows no fixed white glints in either world. Default public API remains unchanged.
- Full buildRelease passes. The PNG (33,913 bytes), MIT license and manifest are present in source, root Source, development and release assets. Engine npm dry-run includes all three; no root tarball was produced because the existing broad root pack includes large unrelated local fixtures. Root asset delivery is verified at the built runtime paths; this is not a claim that a complete root package was installed.
- Existing follow-up buildTs/type validation predates the final shader refinement; no option/signature/type changed in the refinement. Generated output remains uncommitted.
- Scoped ESLint/Prettier, whitespace and all-AgentDocs Markdownlint pass. The required all-AgentDocs Prettier check reports 318 existing unrelated formatting failures; changed documents pass their scoped check. No unrelated document formatting is included.

## Cost bound

RTX 3060 Ti / ANGLE D3D11, 1001×826, local eight-box Globe fixture, fixed camera/time, HDR, MSAA 1, FXAA and model SSR enabled. Alternating off/on/off/on blocks collect 24 non-disjoint GPU timer samples per state over complete `viewer.render()` calls. Other desktop tabs remain active; medians describe this fixture rather than a universal frame-rate guarantee.

| State    | Median ms | Min ms   | Max ms   |
| -------- | --------- | -------- | -------- |
| Lens off | 3.921920  | 3.630080 | 8.174592 |
| Lens on  | 4.222464  | 4.027392 | 8.654848 |

Approximate incremental median is 0.301 ms. Lens retains one native full-resolution RGBA8 output target (3.15 MiB at this size), adds a 256 KiB sampled sprite, and adds no depth/history/capture/geometry replay. Geometry command list stays at eight. The final effect removes the rejected bright lobe; do not spend more passes or add a fluid solver without a new product decision.
