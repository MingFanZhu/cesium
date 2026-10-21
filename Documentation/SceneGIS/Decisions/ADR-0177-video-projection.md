# ADR-0177: Shared observer passes and SDR video projection

## Status

- Approved for phased implementation, 2026-10-21.
- Owner: current task architecture self-review.
- Plan: [video projection](../../../AgentDocs/video-projection/plans/2026-10-21-extension.md).
- Related: ADR-0176, ADR-0161, ADR-0030; SGP-0065.

## Decision

Viewshed and VideoProjection are independent public PostProcessStage consumers of
one private observer state / coordinator and shared GLSL reprojection / visibility
function. Independent selection, content protection and native depth derivation
retain the existing observer contract. Each instance owns its depth target; solar
shadows and borrowed geometry remain separate. Scene.js only dispatches the shared
coordinator through SGP-0065. Planar Surface and S3M consume the shared FrameState
observer list. No implicit projection or cross-World reuse is allowed.

VideoProjection borrows an HTMLVideoElement. Playback, seeking, network and audio
belong to the caller. A new media frame requests rendering and uploads during the
next actual render; identical frames are not uploaded at display refresh rate.
Destroy releases only owned texture, callbacks, events and observer resources.
Video and observer coverage readiness are independent; missing either preserves
the original picture. Dynamic occluders still capture on actual rendered frames.

The first version composites SDR video after exposure / tone mapping with explicit
opacity, preserving target alpha and treating black as content. It is a display
overlay, not a physical light. Media aspect and UV orientation are separate from
observer FOV and depth resolution. Transparent transmission and transparent
receivers are excluded; P2 freezes the exact foreground policy with source evidence.
Multiple stages follow native collection order. No observer capture deduplication
or static-depth cache is introduced without a complete invalidation contract.

## Consequences and validation

Additional observer draws and video uploads are explicit per-instance costs.
Depth resolution, source LOD and thin geometry bound precision. Validate both
Worlds, offscreen occlusion, media lifecycle, orientation / aspect / color, shadow
coexistence and resource destruction. Existing Viewshed regressions gate the
shared extraction. Public API requires full build and generated types checks.
SDK integration, optical calibration, 360-degree and physical illumination are
separate work. Final rendering acceptance belongs to the project owner.
