# Phase Plan: A16-G Model Environment Lighting

## Metadata

- Type: `phase`; status: `completed`; created / updated: `2026-09-11`
- Owner: Architecture Agent / Execution Agent; design: `confirmed`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Diagnosis: [model lighting](../discussions/2026-09-11-model-environment-lighting.md)
- Decision: [ADR-0054](../../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)
- Base: isolated A15 checkpoint `4d1d122b1c`; branch: `feature/atmosphere-clouds-effects`
- Review: [A16 review](../reviews/2026-09-11-a16g-model-environment-lighting.md)
- New upstream seam: `SGP-0010`; user authorizes implementation

## Source facts and implementation

ModelFS calls LightingStage after material/custom-shader processing. Native
PBR consumes automatic primary direction/color, but no SceneGIS atlas/LUT.
Native ModelSceneGraph passes frameState into primitive pipeline processing.
Model.update builds commands after per-model state updates. Existing Globe
lighting publishes its resource record before geometry command construction.

1. Add a SceneGIS-owned Model lighting helper: variant transition/update,
   fragment library/defines and current-frame uniform binding. Wire native
   Model and LightingPipelineStage through paired SGP-0010 hunks.
2. Add source-level PBR direct and diffuse-IBL hooks. Preserve material BRDF,
   explicit light color/SH, specular IBL and emissive. Use ECEF receiver geometry
   and light-normal irradiance to avoid duplicate model transforms/cosines.
3. Remove Moon-only shadow activation and its API/UI. The owner's explicit
   correction keeps only Cesium's existing shadow switches; no replacement
   SceneGIS toggle or alias. Verify native state remains caller-owned.
4. Run real-model GPU regression and native pipeline tests. Verify live shader
   bindings, positive shadow/source response, restoration and bounded cost.
5. Run scoped lint, full build/types, upstream audit and required AgentDocs
   checks. Record code review and owner-visible result before phase closure.

GLSL uses the existing generated shader pipeline; test entry is gulp/Karma via
`npm run test -- --includeName ... --failTaskOnError`. No generated edits.
New tests belong under engine Specs/SceneGIS. Existing resource fixtures are
reused where unchanged rather than rerunning the entire environment suite.

## Scope and risks

No new reflection cube map, cloud sampling change, atlas topology, asset or
Planar extension. Native specular reflections remain an explicit fidelity limit.
Relevant risks are duplicate PBR energy/cosine, world-coordinate shadow errors,
stale borrowed resources after toggles, model shader sampler/compute cost and
shadow lifecycle ownership. Each requires direct scoped evidence, not a broad
test matrix or final-color darkening workaround.

## Handoff

Implementation and focused GPU/native/lifecycle verification are complete.
Full build, type generation and type checks pass. The project owner explicitly
accepts the restored current model view on 2026-09-11 ("效果符合预期"). Architecture
closes A16 with the bounded shader cost and native specular-IBL limitation in
the linked review. The commit containing this record is the independent A16
local checkpoint after A15 `4d1d122b1c`; no push or successor activation.

The only design correction follows the owner's explicit instruction to retain
Cesium's original shadow switches without adding a SceneGIS switch. The prior
Moon-only API/UI and ownership policy are removed. The new GPU fixture disables
its native environment-map generator to keep the pre/post native reference
stable; this changes only the fixture, not runtime IBL behavior.
