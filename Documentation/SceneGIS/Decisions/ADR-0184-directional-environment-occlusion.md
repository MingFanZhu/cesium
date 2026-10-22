# ADR-0184: Directional environment specular occlusion

- Date: 2026-10-22; status: implemented; owner visual acceptance pending.
- Phase: [R28](../../../AgentDocs/rendering-quality/plans/2026-10-22-r28-directional-occlusion.md).
- Amends: ADR-0084 / ADR-0093; integrates with ADR-0158 / ADR-0161.
- Upstream seam: SGP-0014, native `LightingStageFS.glsl`, `ImageBasedLightingStageFS.glsl`, and `PostProcessStageCollection.js` documentation.

## Decision

Expose `scene.postProcessStages.ambientOcclusion.uniforms.directionalOcclusion`
as a boolean or native uniform callback, default false. AO must be enabled. Reuse
the existing current-frame GTAO horizons to estimate a visibility first moment
and filter it with the existing geometry-normal/depth bilateral weights. Keep
the scalar path unchanged when disabled. No history, geometry replay or additional
radial depth samples; optional estimate/filter storage increases by 7 B/pixel.

The existing deferred opaque-depth publication precedes environment lighting.
Compute direction information there once, including completed multi-frustum depth,
and skip the later duplicate estimate. The native PBR lighting library receives
owned cone-intersection functions through a derived lighting command. Do not
replace material normals or native BRDFs. Evaluate base and clearcoat directions
independently and retain the native anisotropic direction. Native perceptual
roughness is squared before the reference alpha-based aperture and mirror fade.

Keep diffuse scalar AO, applied before native layering only in this PBR variant.
The later scalar indirect correction excludes this already-occluded PBR energy;
ordinary Phong, vector and terrain continue their existing scalar correction.
SSR records the occluded environment and unchanged material response. Composite
as `(1-confidence)*occludedEnvironment + confidence*tracedReflection` without
applying environment visibility to a resolved hit a second time. Radiance capture,
SSIL, native material AO and caller-supplied IBL retain their own semantics.

Only opaque/MASK deferred PBR receivers participate. Transparent materials, the
separate translucent inverse-classification working set, background, unlit and
emission are excluded. Screen depth cannot represent offscreen, hidden layers or
transparent occluders; a single visibility cone cannot represent multiple openings.
No alternative geometry/capture/ray-tracing pipeline is introduced.

Planar retains its strict slab atmosphere. Directional diffuse sky irradiance is
a separate prerequisite for future diffuse bent-normal work, not part of R28.

## References and provenance

- XeGTAO `a5b1686c7ea37788eeb3576b5be47f7c03db532c`,
  `Source/Rendering/Shaders/XeGTAO.hlsli`, analytic Algorithm 2 moment, MIT.
- Filament `6fb6c921a46dca9edbcbb2594bd196a8b593721a`,
  `shaders/src/surface_ambient_occlusion.fs`, spherical cap intersection and
  roughness-cone approximation, Apache-2.0.
- Formulae originate from Jimenez et al., Practical Real-Time Strategies for
  Accurate Indirect Occlusion, and Oat / Sander, Ambient Aperture Lighting.

Owned GLSL adapts the small mathematical routines to existing slice coordinates,
full-resolution spatial filtering and native Cesium material conventions. License
and provenance records accompany the distribution under `Assets/SceneGIS`.

Implementation evidence and measured limitations: [R28 review](../../../AgentDocs/rendering-quality/reviews/2026-10-22-r28-directional-occlusion.md).

## Upgrade and acceptance

Recheck native IBL/clearcoat layering, material normal/roughness conventions,
deferred depth publication, per-frustum lifecycle and SSR source/replacement.
Validate open/one-sided visibility, protected direct/emission/diffuse paths,
SSR/SSIL coexistence, toggles, resize, destruction, both-world pictures and GPU
cost. Preserve defaults until owner visual acceptance; reference timings are not
SceneGIS performance guarantees. Follow-up formats or lower-resolution estimation
require measured need and their own quality evidence.
