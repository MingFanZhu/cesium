# Phase R15: PBR reference scene

- Type: `phase`; status: `completed`; created: `2026-09-21`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / reviewer: current task, architecture and execution self-review
- Architecture review: confirmed; previous accepted checkpoint: R4 `c3add1660a`
- ADR / SGP: no new runtime API, renderer, build pipeline or upstream seam planned

## Scope and source facts

The owner approves an Intel new Sponza baseline and a composite PBR evaluation page with
standard material samples and a local water pool. Keep the official source assets intact and
distinguish the composite from the unmodified asset baseline. Globe and Planar use the same
public rendering APIs. Existing examples use one ESM runtime, local assets, fixed views/time,
reversible effect controls and `Test/example-lifecycle.js` for destruction.

Intel distributes a multi-format archive containing glTF and 4K PBR textures; inspect its real
contents, bounds, units and material extensions before choosing the exact runtime subset.
Preserve source provenance/license and pin the content. Large source archives and acquired
runtime assets may use an explicitly ignored local data directory with a reproducible preparation
script and small tracked manifest, rather than adding gigabytes to Git. Normal page startup is
offline; missing data must show actionable setup information rather than a substitute scene.

Khronos material samples cover metal/roughness, textured dielectric surfaces and glass. Current
Model material loading does not implement transmission/volume/IOR. Preserve their original
extensions and identify glass as an unsupported target, not a successful glass demonstration;
do not silently replace glass by alpha blending or broaden this phase into a renderer change.
Water uses the existing SceneGIS public surface API, not a new simulation or shader.

## Implementation and validation

1. Acquire and inspect official source archives; document versions, licenses, runtime subset,
   resource budget and any explicit delivery conversion. Keep original source assets available.
2. Add independent Chinese baseline/composite entry pages, fixed camera presets, fixed lighting
   and exposure, effect controls and exported view/settings. Include materials and a pool at
   meaningful architectural scale; expose ready/error states and safe asynchronous cleanup.
3. Add deterministic fixture checks for provenance, local references, required normals/materials
   and declared unsupported extensions. Add bounded browser regressions for both Worlds,
   baseline/composite switching, unchanged camera under effects and resource destruction.
4. Inspect actual loaded pages and material close-ups; run scoped lint/format/tests and document
   measured resource/scene size. No full engine rebuild required unless engine sources change.
5. Record review and remaining glass/GI limitations, update directory/README and handoff, then
   create one local checkpoint before entering a new rendering phase.

## Risks

High-resolution authoring assets may exceed practical browser texture or draw budgets. Make any
delivery optimization explicit and retain the original baseline. Different glTF material extensions
must not be mistaken for supported features. Fixed-time water permits reproducible comparisons;
animation remains optional. No promise of native ray-traced reference equivalence or real GI.

## Delivery and deviations

- Added `Test/Rendering/PBR基准.html`, `PBR综合验收.html` and shared example assembly,
  local preparation script, pinned provenance manifest and a dedicated E2E configuration.
- Measured Intel main: 3,747,018 triangles, 405 primitives, 72 4K textures. Estimated RGBA8
  with mipmaps is 6 GiB for the main alone. Default delivery explicitly uses 2K textures
  (about 1.5 GiB for main); original glTF/buffers/materials remain byte-identical and original
  4K resources are retained behind a labeled entry. This is a disclosed texture derivative,
  not an assertion that the default is an untouched 4K image baseline.
- Both pages use fixed directional light, diffuse SH, existing local specular IBL, exposure
  and time. Authored punctual lights are not imported. Composite adds curtains, Khronos
  metal/roughness samples, FlightHelmet, the unsupported glass target and local water.
- Intel's bundled license header and appended CC BY text differ in breadth. Preserve the
  complete original and document the discrepancy; no large asset is committed or published.
- Author cameras look upward; the Planar surface controller legitimately resets such an
  initial pose. These architectural examples unregister it and use public Camera operations
  for shared look/pan/dolly inputs. No controller, renderer or upstream behavior changed.
- Five dedicated fixture/E2E checks pass: source/material/normal contracts, both Worlds,
  fixed initial camera, A/B invariants, views, wheel/restore, JSON export, complete and
  pending-load cleanup, missing-data instructions and main-only composition.
- Technical gate and self-review complete; see [review](../reviews/2026-09-21-r15-pbr-reference-scene.md).
  Owner visual acceptance remains pending. No later phase is activated.
