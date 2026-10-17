# ADR-0164: AgX in the native HDR display slot

- Status: Accepted
- Date: 2026-10-16
- Related: ADR-0044, ADR-0100, ADR-0154, ADR-0161; SGP-0060

## Context and decision

The owner approves neutral example radiance scales and AgX after the spectral
conversion audit. The pinned three-geospatial atmosphere examples use
postprocessing 6.37.6 and three 0.179.1 with AgX and manual exposure 10. Solar
irradiance and Lambert normalization already agree; display gain is not an
additional solar multiplier.

Add `Tonemapper.AGX` to the existing enum and validation. The collection selects
an owned private stage factory in its existing tone-mapping switch. Keep the
five native curves, PBR Neutral default and exposure default 1. No public
parallel controller, standalone post-tone-map effect or implicit environment
override is introduced. SGP-0060 covers only `Scene/Tonemapper.js` and
`Scene/PostProcessStageCollection.js`; shader and factory remain SceneGIS-owned.

## Color and exposure contract

Adapt the AgX implementation from three.js r179, commit
`54ac263593c81b669ca9a089491ddd9e240427d2`,
`src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`.
The source uses the Filament / Blender Rec.2020-based approximation: linear
Rec.709 to Rec.2020, inset, log2 range, polynomial sigmoid, outset, linearization,
Rec.2020 to Rec.709 and gamut clamp. Keep the neutral look and full matrix
precision. The log floor belongs to the reference algorithm's zero/negative
input domain. Preserve its MIT license in an `@license` block; Cesium's existing
GLSL generator retains this in generated modules and bundles. Recheck source,
license and numerical references when updating the pinned implementation.

The stage applies native manual exposure or the existing auto-exposure divisor
exactly once, then optional HDR grading, then AgX, then `czm_inverseGamma` once.
AgX's internal power 2.2 returns linear RGB; it is not the display encoding and
must not be removed or replaced by `scene.gamma`. Alpha passes through unchanged.
Cesium retains its configurable power-law output gamma, rather than adopting
Three.js's sRGB transfer function; the curve matches but screenshots need not be
pixel-identical. Automatic exposure remains opt-in. LDR retains ADR-0161's
clamp/gamma-only output, ignoring exposure and tone selection.

## Examples, ownership and verification

AdvancedEnvironment examples remove the old Globe 4 / Planar 10 background and
Globe 10 surface presets. Daytime physical examples explicitly select AgX and
manual gain 10 as an inspectable reference, not an engine default or EV100 camera
calibration. Physical-atmosphere controls allow manual exposure and curve changes.
Existing vector examples provide the same display controls for visual comparison;
their geometry, lighting authority, style visibility and occlusion remain intact.
Night-specific presets remain caller-owned rather than inheriting a daylight gain.

The factory creates the same single native post-process stage, with no additional
texture, framebuffer, sampler or draw. Collection switching and destruction own
its lifetime. Repeated exposure changes reuse shader and targets. GLSL and types
use existing generators; generated artifacts are not committed.

GPU Specs compare independent pinned reference values, negative/black/highlights,
manual and automatic exposure, alpha, grading order, HDR/LDR switching and resource
reuse/release. Run affected native collection and grading/exposure Specs plus full
build/types. Inspect Globe atmosphere and Planar vector pages and record bounded
draw/byte evidence. Visual acceptance remains with the owner. If this aligned
reference still fails the intended appearance, compare UE Sky Atmosphere and its
physical-light/exposure conventions before changing transport or solar constants.
