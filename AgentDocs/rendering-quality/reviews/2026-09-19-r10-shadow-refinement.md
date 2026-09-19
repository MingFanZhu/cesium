# Review: R10 Shadow Refinement

- Type: `review`; status: `completed; owner advanced to direct-only lighting after zoom fix`
- Date: `2026-09-19`; owner / reviewer: Current task, architecture and execution self-review
- Target: [R10](../plans/2026-09-19-r10-shadow-refinement.md)
- ADR / SGP: `ADR-0088` / `SGP-0013`
- Previous checkpoint: R9 `f6028f6606`

## Findings and dispositions

| ID     | Severity | Finding                                                                                                 | Disposition                                                                                                                                                                                                                                         |
| ------ | -------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R10-F1 | P1       | Applying fixed maximum-distance splits to Globe loses cutout and small-model shadows at low resolution. | Fixed: retain receiver-range utilization with upward power-of-two far bands; retain native out-of-view rejection. All 47 native shadow tests pass, including cutout, resize, soft filtering and distant receivers. Owner: architecture / execution. |
| R10-F2 | P2       | A wide slope bias can suppress stripes by moving contact edges.                                         | Fixed: use geometric receiver-plane correction at individual texel centers and a small precision bias. GPU tests prove a slope is lit and a receiver only 0.002 depth behind it remains shadowed.                                                   |
| R10-F3 | P2       | Nearest 3x3 PCF produces discrete edge steps; crossing the atlas tile can sample another cascade.       | Fixed: continuous 4x4 tent, clamped to the selected tile, with existing overlap blending. GPU tests verify subtexel changes, atlas containment and the blend midpoint.                                                                              |
| R9-F4  | P2       | Globe scan and reference-plane self-shadow bands were visible in R9.                                    | Fixed by the shared fitting / depth correction. Browser inspection confirms the Globe overview is free of those bands and the close-up renders at low sun. No fixture geometry or texture was changed.                                              |

## Verification

- Native `ShadowMap` / `ShadowMapShader`: **47 passed** on Chromium, ordinary GPU run.
  This includes point, spot, single cascade, packed-color depth fallback, clipping and native controls.
- Existing `SceneGISPlanarShadows`: **9 passed**, strict WebGL validation. Real terrain/model
  pixels, slope, large coordinates, orthographic/perspective, opacity, clipping, Entity controls and lifecycle.
- New `SceneGISShadowQuality`: **5 passed** in both dev and release, strict WebGL validation.
  Includes four analytical GPU receiver/filter cases plus real Globe ECEF grid stability,
  atlas reuse and destruction. The Globe case waits for the fitted receiver range to be published;
  no product settling, fallback or test-only branch was introduced.
- Reference/example Chromium E2E: **5 passed**. Two new cases load all 14 local shadow models,
  exercise hard/soft, resolution and cascade controls, preserve BFCache, and release atlas/models.
  The existing public scan, A/B, export and lifecycle tests pass in both Worlds.
- Browser visual inspection: independent scene in both Worlds, 35-degree and 10-degree Planar
  light, real Globe overview / low-sun building close-up, and Planar scan. Contacts and thin-post
  shadows remain visible; primary scan bands are removed.
- Development build, release build, `buildTs` and `tsc` passed. `buildTs` retains existing
  upstream TSD-JSDoc warnings; no public API is added. Scoped ESLint and upstream patch audit pass.
- Scoped Prettier, Markdownlint and whitespace checks pass. The mandatory all-AgentDocs
  formatting check reports the same 316 pre-existing unrelated warnings as R9.

## Zoom acceptance follow-up

- R10-F4, P1, fixed; owner: architecture / execution. The shadow example overrode camera far
  to 2000 m while its 2000 x 2000 m planar extent required a farther home view. The first wheel
  event called `_getRanges -> computeHomeState` and stopped rendering with
  `The camera near/far range cannot contain the planar home view.`
- Remove the example's far override and retain the native camera range. Shadow coverage remains
  independently bounded by `shadowMap.maximumDistance`; no controller or shadow runtime change.
- Extend the existing two-world example E2E with real wheel input in both directions and assert
  camera movement, a running render loop and no error. The Planar case failed before the fix;
  both World cases pass after it. Manual wheel zoom on the reported page also succeeds.
- Scoped ESLint / Prettier pass. This follow-up changes no upstream-owned file and needs no new SGP.

## Performance measurement

Same RTX 3060 Ti / ANGLE D3D11, Planar independent scene, close camera, 14 models,
2048 per-cascade map, 350 m range, soft shadows, **1185 x 667 actual drawing buffer**.
EXT_disjoint_timer_query_webgl2 measures each whole scene render, eight warm renders and 40 samples;
both runs report no disjoint event. Automatic rendering is restored and queries are deleted.

| Build               | GPU median | GPU P95  |
| ------------------- | ---------- | -------- |
| R9 native/R1 filter | 1.719 ms   | 3.516 ms |
| R10                 | 2.597 ms   | 3.807 ms |

Observed median increase is **0.878 ms** in this small scene. This is a bounded local measurement,
not a city-scale guarantee or an isolated per-filter microbenchmark. Soft filtering grows from
9 to 16 depth reads, or 32 in overlap bands; hard shadows use one read. No extra texture,
framebuffer, pass or temporal history is allocated. The native atlas remains its existing size.

## Delivery and remaining limits

Changed upstream-owned files are only `packages/engine/Source/Scene/ShadowMap.js` and
`packages/engine/Source/Scene/ShadowMapShader.js`, both paired `SGP-0013`. Other files listed in
that historical SGP are not modified in R10. No generated artifact is tracked.

Distance-band crossings, changing light direction or changing the frustum can redistribute
sampling. Subtexel occluders remain resolution-limited. The native final-color shadow modulation,
photogrammetry's baked illumination and missing offscreen terrain casters remain known limits.
This phase implements continuous PCF, not PCSS/contact-hardening or direct-only lighting integration.

The owner moved on to direct-only shadow lighting after the zoom fix. This progression closes
the R10 gate; it is not a separate explicit visual-acceptance statement. Architecture / execution
creates the isolated R10 checkpoint before activating that follow-up.
