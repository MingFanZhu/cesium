# R16: Cycles reference and image-quality calibration

- Type: `phase`; status: `completed`; created: `2026-09-28`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: `9e85d189c5`
- Owner / reviewer: current task, architecture and execution self-review
- Architecture review: `confirmed`; diagnostic tools and examples only, no runtime API,
  upstream shader or renderer modification

## Goal and facts

The owner approves a reference baseline before local probes or GI implementation.
The current Bistro uses the prepared 1K glTF, physical Planar sky, native PBR Neutral,
AO/shadows and no AA. SSR was enabled by the owner during capture. Preserve the
owner view/settings and source assets.
Blender is installed; the already-open unsaved document must remain intact.

Export the exact browser camera, dimensions, physical Sun direction/beam irradiance,
and unfiltered HDR sky radiance. Import the same prepared glTF into a separate Blender
background scene. Use the same local Z-up frame and a matching perspective camera.
Keep scene-linear EXR and apply the existing Cesium PBR Neutral/gamma output transform
to a PNG separately, rather than comparing AgX/ACES with Neutral.

The reference explicitly distinguishes real path-traced geometry occlusion/bounces from
the runtime's hemispherical diffuse sky, baked material AO and approximate specular IBL.
Atmospheric perspective/fog are excluded from the controlled pair and recorded separately.
The comparison is evidence for locating gaps, not a pixel-equality claim across BRDFs.

## Implementation and bounded verification

1. Save current browser snapshot and original view. Add an explicit development-only
   export helper that borrows existing physical-lighting sources; release temporary GPU
   resources after readback. Do not add engine hooks or publish private access as API.
2. Add a reproducible Blender preparation/render script under `scripts/scenegis/`, with
   ignored outputs under `Test/Rendering/pbr-data/local/calibration/`. Record versions,
   settings and source identities; never modify the supplied GLB/FBX or open unsaved scene.
3. Render a bounded street reference and direct/full transport comparison; preserve an
   editable `.blend` and linear EXR. Supply a separate local visual-comparison page.
4. Check camera projection and color transform contracts automatically, renderer/export
   cleanup and UI behavior with focused tests, and inspect real images. Inspect normal,
   roughness and metalness views plus AA/SSR differences without altering source materials.
5. Record material/importer and lighting approximations, findings, review and a local
   checkpoint. Do not activate probes or GI implementation in this phase.

## Risks / acceptance

Native window capture may be unavailable; use Blender's supported background Python API
and deliver an independent project. Cycles availability and memory are checked before a
full render. Use bounded samples/resolution; inspect before increasing quality.
The captured sky has no Sun disk because direct illumination already contains the Sun.
Sky cubemap resolution and the native diffuse approximation are documented comparison
limits. An accepted reference must retain visible street detail, matched camera/material
identity and explicit transport/output settings; no unexplained artistic brightness fit.

## Confirmed calibration correction

Material diagnostics reveal all 131 source ORM red channels are zero. The source Falcor
format describes occlusion as unsupported, while the earlier preparation bound these
zeros as glTF visibility. Correct only this fixture binding and retain source channels,
geometry and files. Existing prepared data can be repaired from its recorded source
channel ranges without re-encoding textures. Update the fixture regression accordingly.
125 ORM textures also have constant roughness near 0.741; retain it as authored evidence,
rather than inventing material variation. Native base IBL currently does not multiply
material occlusion, so the binding correction alone is not claimed to fix this view.

## Result and handoff

Same-camera/light/output reference, direct/full Cycles renders, material/AA/effects views,
export button and standalone comparison page are complete. Source correction is limited
to the confirmed unused AO bindings. Six bounded browser/fixture/Blender checks pass.
[Review](../reviews/2026-09-28-r16-cycles-calibration.md) records findings, fixes and limits.
Owner visual acceptance is pending; no following GI/probe phase is activated.

ESLint and changed-file Prettier pass. Required global AgentDocs markdownlint passes;
global Prettier still reports the same 316 pre-existing files. No unrelated formatting
changes were made. No upstream-owned file or SGP changed.
