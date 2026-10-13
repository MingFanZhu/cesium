# ADR-0158: Shared linear depth for deferred screen consumers

- Date: 2026-10-13
- Status: accepted; technical and owner visual qualification passed
- Plan: [P3b](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-13-p3b-shared-screen-depth.md)
- Amends: [ADR-0156](ADR-0156-webgl-deferred-lighting-experiment.md)
- Upstream integration: none added; existing SGP-0046 scheduling is sufficient

## Decision

The qualified single-sample deferred experiment and AO/SSR/SSIL use the same
current-frame linear eye depth. Keep the existing lighting-MRT owner and its
linear-depth FramebufferManager. The deferred producer selects that target after
opaque geometry and before screen lighting, clears it, and converts native depth
once. All consumers retain their existing depth samplers, material responses,
normal semantics, history, resolution, sampling budgets and composition order.

When no screen effect owns the target, deferred allocates and owns one R32F target.
When a shared owner becomes active, deferred releases its redundant owned target.
A borrowed Texture reference is separate from owning manager fields and is refreshed
every frame; disabling or destroying deferred never destroys a consumer's resource.
The shared MRT resolve skips the redundant raw-depth blit and conversion only after
the current deferred frame publishes its depth. The ordinary forward/replay and
MSAA behavior remains unchanged. Raw depth snapshot allocation remains available
in effect state; this step does not claim its memory has been removed.

The depth conversion shader discards background. Every deferred frame must clear
the selected target to zero before conversion, including frames where geometry
moves away from previously covered pixels. Empty frames invalidate publication.
The published snapshot remains immutable through water and transparency.

## Cost and alternatives

One redundant R32F target (4 bytes/pixel), one depth blit and one fullscreen depth
conversion are removed whenever a lighting-MRT consumer is active. This is about
3.91 MiB at 1280 x 800, not a claim of a large whole-frame speedup. Existing material
and lighting-response targets remain distinct: AO reconstructs geometry normals,
SSR consumes evaluated reflection rays and weights, and SSIL uses bounded diffuse
source/receiver responses. Replacing those with arbitrary G-buffer channels would
change the radiometric or filtering contract and needs separate evidence.

## Qualification

Compare current HDR output and GPU cost at fixed Bistro camera/time/effect settings.
Test orthographic/log perspective, MASK/background disocclusion, owner transitions,
resize/disable/destroy and water borrowing. Run relevant AO/SSR/SSIL regressions,
build/release/types and owner visual gate before a phase checkpoint. No new public
API, device threshold, scene selection mode or generated source edit is introduced.
