# R23: WebGL street lighting baseline

- Type: `phase`; status: `completed; owner visually accepted`; date: `2026-10-12`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / reviewer: current task, architecture and execution self-review
- Architecture review: confirmed; preceding checkpoint: `16422ff2f4`
- Related decisions: ADR-0054, ADR-0085, ADR-0089, ADR-0100
- ADR / SGP changes: none planned; existing public controls are sufficient for this pass

## Source facts and scope

The owner authorizes WebGL direct light, environment light, shadows and exposure work
on the original Bistro street. The shared-fix backport is committed. Preserve WebGPU
work and older outstanding visual gates; R22 remains technically complete with visual
review pending and is no longer the active implementation phase.

The original composite page defaults to a largely shaded alley at 19:00 UTC, manual
exposure 1, physical surface/background scale 3, native IBL factors (1,1), 2048 per-cascade
shadows, 300 m shadow range and native darkness 0.3. PBR Neutral is already the native
tone mapper. The physical source comes from the atmosphere LUT, not SunLight.intensity;
do not add a misleading solar-intensity slider. Native ImageBasedLighting factors
already separate diffuse/specular environment weight. Shadows affect only direct light
under ADR-0089; darkness 0.3 retains direct light in fully occluded areas.

The current image is underexposed with blue, insufficiently separated shaded surfaces.
Runtime comparison confirms exposure, IBL weight and darkness have visible leverage.
Establish a reviewable example baseline before proposing a new lighting algorithm.
Preserve original geometry, source material channels, 1K delivery, native navigation,
and explicit optional AO/SSR/SSIL/probes. Reduced diffuse IBL is an authored balance,
not a claim of physically computed sky visibility or GI.

## Implementation

1. Add a street-level restaurant view after checking actual asset coordinates.
   Keep the old street view accessible. Freeze time for matched comparisons.
2. Add original/tuned lighting presets independent of the existing effects A/B.
   Switching lighting must preserve camera, clock, effects and exposure mode. Expose
   native environment weights, shadow resolution/range/darkness, and manual exposure.
   State/export must report actual values, including tone mapping and shadow settings.
3. Choose a bounded daylight preset by matched images of lit stone, shaded doors,
   vegetation and thin street-furniture shadows. Do not compensate for shader bugs
   using undocumented material replacement or baked colors.
4. Make the clock controls reflect the actual Cesium Clock so stopping playback keeps
   the visible instant. Check manual and automatic exposure separately.
5. Correct stale capability text. Record visual limitations and measured cost.

## Verification and gate

Extend existing Bistro E2E checks in both worlds: loading, unchanged geometry, preset
camera/time invariance, real bound IBL/exposure/shadows, Clock pause, export and teardown.
Capture matched original/tuned images at a fixed camera/time and one shadow detail view.
Use a bounded timing comparison for any larger shadow atlas. Run scoped lint/format and
AgentDocs checks. Example-only changes do not need full engine/type/release rebuilding.

If diagnosis requires a new API, changes to physical lighting semantics or a major
algorithm/cost tradeoff, stop for the owner's decision before dependent implementation.
Technical review and owner visual acceptance precede the phase checkpoint and next phase.

## Delivery and evidence

The original page now starts at the checked restaurant pavement view. The daylight
balance uses exposure 2.5, diffuse/specular IBL (0.5,1) and shadow darkness 0. Geometry,
source materials, physical radiance scale and effects are unchanged by preset switches.
The old camera and original lighting remain independently selectable. Clock playback
now synchronizes the panel; pause no longer rewinds to the previously edited hour.

The high-resolution trial exposed a budgeting mistake: native size is per cascade.
2048 produces a 4096-square four-cascade atlas (64 MiB on this depth/stencil format),
4096 produces an 8192-square atlas (256 MiB). Keep 2048 as default, label the optional
4096 control accurately, and retain the full 300 m range. No new rendering algorithm,
resource type, engine API or material override is introduced.

Both-world Bistro E2E and the shared Planar Sponza regression pass (three cases),
including fixed camera/time, effect independence, auto-exposure lock, Clock pause,
export and destruction. Matched 1280x800 images and one 36-frame GPU sample per setting
confirm the visible change without a default cost increase: original/tuned GPU medians
14.380/14.369 ms, disjoint=false, 64 MiB shadow texture, 1591 command-list entries and
2829226 model triangles in both. These are local stationary-scene measurements.

Scoped lint/format and AgentDocs Markdown lint pass; repository-wide AgentDocs Prettier
retains 398 historical warnings. No upstream-owned or generated file changed; no SGP.
See [technical review](../reviews/2026-10-12-r23-webgl-street-lighting.md). The owner
accepts this first baseline and authorizes its checkpoint and continued work on
2026-10-12. This does not claim solved sky visibility, new GI, or acceptance of older
rendering phases.
