# ADR-0098: Geometric Specular Antialiasing

- Date: `2026-09-28`; status: `accepted`
- Phase: [R19](../../../AgentDocs/rendering-quality/plans/2026-09-28-r19-specular-antialiasing.md)
- Upstream integration: `SGP-0025`; baseline: Cesium 1.144

## Context and alternatives

MSAA filters geometry coverage, but subpixel specular lobes still alias. TAA
improves this scene and stays independent. Raising every material's roughness
would alter flat mirrors; an extra postprocess cannot recover material lobes.
Three.js offers inexpensive geometry-normal derivative filtering within PBR.

## Decision

Adapt Three.js r180 `lights_physical_fragment` and `normal_fragment_begin`,
commit `0af9729d0c143a86a1d725d6e2c3ad83301f3f34`, MIT. The maximum component of
`max(abs(dFdx(geometryNormal)), abs(dFdy(geometryNormal)))` adds to perceptual
roughness of base and clearcoat, capped at one. Omit Three's fixed 0.0525 floor:
it is tied to its 256-pixel PMREM layout, which Cesium does not share.
The geometry normal is normalized before differentiation; normal maps remain
authored. This is geometric filtering, not normal-map variance filtering.

`SceneGISSpecularAntialiasing` is an optional Scene-owned setting object with
an `enabled` boolean (default false). It allocates no GPU resource. Explicit
destruction detaches it; Scene destruction releases it. Globe and Planar have
identical API and shader behavior. MSAA, TAA and FXAA remain caller-owned.

FrameState publishes the current boolean. LightingPipelineStage binds an owned
shader and uniform for PBR. LightingStageFS applies it after native material /
CustomShader and before direct, local, IBL, clearcoat and SSR material capture.
Unlit and missing-normal paths stay unchanged. Toggling uses the same commands
and shader programs; disabled execution skips derivative filtering. No new
sampler, target, pass, geometry submission or temporal history is introduced.
Material edits can reset caller-owned TAA/SSR history through their existing API.

## Build, upgrade and validation

Existing GLSL generation and asset copying (ADR-0030) deliver the owned shader
and MIT attribution; no generated files or build scripts change. SGP-0025 covers
only Scene.js frame publication/destruction, LightingPipelineStage.js binding,
and LightingStageFS.glsl invocation. On upgrade check material/CustomShader
ordering, geometry-normal normalization and every roughness consumer; remove
the seam when native Cesium exposes equivalent optional filtering.

Validate public lifecycle, production shader behavior, real Model consumers,
both-world examples, existing normal mapping, release/types and bounded GPU cost.
Results and remaining visual limits belong in the R19 review. Silhouettes,
texture minification, alpha coverage, diffuse aliasing and absent normals need
separate treatment; no claim of complete scene antialiasing is made.
