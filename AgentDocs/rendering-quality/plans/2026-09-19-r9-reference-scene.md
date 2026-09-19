# Phase Plan: R9 Public-data Reference Scene

- Type: `phase`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R8 `b4a27c7358`, owner accepted
- ADR / SGP: None; Test-only composition, no runtime or public API change
- Open discussions: None

## Scope and source facts

The owner's main content is textured photogrammetry, not authored high-detail PBR materials.
Prioritize shadow quality, indirect lighting, reflection completeness and local night lighting
after a reproducible reference scene exists. Material improvements mainly serve added GLB assets.
Cloud reflections remain deferred. Each future effect also requires its own focused example page.

Use the public AGI HQ photogrammetry OBJ/MTL/JPEG archive linked by Cesium's photogrammetry tutorial.
Convert a fixed local copy to GLB and wrap it as a local 3D Tiles 1.1 leaf for the native tileset path.
Retain its baked color textures and document that they are not de-lit albedo. Use the existing
public CesiumMilkTruck GLB plus small neutral PBR reference surfaces for controlled reflection.
All runtime assets stay local; include source attribution, preparation command and license evidence.
This small campus scan is not a city-scale streaming/LOD benchmark.

## Implementation

1. Add an independent Chinese HTML/ESM entry under Test/Rendering, with Globe/Planar placement,
   fixed camera presets, paused simulation time, controlled daytime and low-sun conditions.
2. Add one-view A/B parameter comparison so geometry, camera and resolution remain identical.
   Freeze A's accepted-feature settings; B is adjustable. This compares settings within a build,
   not executable renderer versions. Export a reproducible scene/camera configuration for capture.
3. Offer original-texture versus lit-photogrammetry inspection, plus separate controls for existing
   shadows/AO/SSR and added GLB visibility. Do not imply that GI or local lights already exist.
4. Provide a rendering example directory linking the shared scene and existing focused effect pages.
   Record the owner's updated priorities in the extension roadmap.
5. Keep the example as API assembly only. Use existing lifecycle helper and dispose caller-owned
   controllers/shaders on non-BFCache pagehide, including late asynchronous model loads.

## Verification and exit gate

- Inspect the real scan, placement, fixed views and effect toggles in both worlds.
- A bounded browser E2E verifies local-only asset loading, A/B restoration, fixed time/camera
  configuration, real tileset readiness, render errors and lifecycle cleanup.
- Scoped formatting/lint, asset provenance and ownership review; no engine build/type rerun
  unless implementation facts require a runtime change.
- Technical review and owner visual acceptance before the R9 checkpoint.

## Limits

Captured shadows remain inside photogrammetry textures; dynamic relighting is an approximation.
The small single-leaf sample cannot measure multi-level streaming or large-city GPU budgets.
No new shadow, GI, reflection or local-light implementation is part of this phase.

## Current handoff

- Implemented: local public scan, same assets in both Worlds, four camera presets, three fixed
  times, A/B controls, configuration export, original-texture mode and independent effects index.
- Technical review: [R9 findings](../reviews/2026-09-19-r9-reference-scene.md).
- Two focused browser E2E cases and one normal-accessor fixture regression pass; source checksum
  and actual visible triangle count verified. Scoped ESLint / Prettier, all AgentDocs Markdownlint
  and upstream audit pass; all-AgentDocs Prettier retains 316 pre-existing unrelated warnings.
- Upstream-owned changes / SGP: None. Owner accepted on 2026-09-19 and requested shadow refinement next.
- An existing Globe shadow-banding defect is captured for the subsequent shadow-quality phase.
