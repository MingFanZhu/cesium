# G2：自有高斯接收与遮挡

- Type: phase plan
- Status: completed
- Parent: [Gaussian extension](2026-11-02-gaussian-extension.md)
- Date: 2026-11-02
- Owner / architecture review: current task, confirmed
- Entry: G1 checkpoint 24137b6d05
- ADR: ADR-0208; upstream seam: SGP-0065, Scene.js only

## Implementation

Add readonly gaussianTargets and gaussianAlphaThreshold options to SceneGISVideoProjection.
Validate exact owned primitive types, nested Scene membership, source lifetime and a four
projector cap per target. A nonempty list is Gaussian-only receiving; its native display stage
passes scene color through, avoiding terrain-behind-splat projection and double composition.

Reuse the published mapping/order/page textures. Receiver/depth shader variants are lazy
and owned by the Gaussian renderer. Derive a maximum-density 3D point per fragment from
the Gaussian covariance and display ray. Mix borrowed media in captured RGB, keep alpha,
perform existing premultiplied blending. Projector depth uses the same sampling rule with
per-fragment alpha threshold, alongside native mesh/terrain depth. No regular draw depth write.

Before main Gaussian drawing, capture only Gaussian observers using a narrow SGP-0065
dispatch. Classic observers retain the later schedule. Media uploads happen once when dirty;
coverage is ready only for a settled current union view. Capture uses separate transforms
and never updates the controller, sorter or main-command uniforms.

## Verification

Real video + real Worker GPU Specs cover both Worlds, color, Gaussian target / mesh blocking,
offscreen views, changed projector / model transform, pause, opacity, disable, removal,
multi-projector cap and Scene teardown. Existing Gaussian and Viewshed/Video Specs gate the
shared seams. Inspect programs, atlas and upload counters; build / types after API changes.
Document actual deviations and review/commit before G3 example qualification.

## Outcome and qualification boundary

G2 core and lifecycle are implemented. Three new strict GPU cases cover invalid ownership /
capacity, both Worlds, real video/Workers, native blocker, offscreen capture, model/view edits,
multi-projector collection order, opacity/pause/disable and active Scene destruction. Existing
256 Gaussian, 8 video and 14 Viewshed cases pass; latest target/media reruns also pass.
Development build, build-ts, tsc and SGP audit pass. Only Scene.js changes upstream.

Front/rear Gaussian visual edges, letterbox / flip and measured hardware costs remain G3
qualification with the deterministic wall/panel example, rather than being inferred from the
sparse protocol fixture. This narrows G2 evidence without removing those overall gates.
Review: [G2](../reviews/2026-11-02-g2-gaussian-receivers.md).
