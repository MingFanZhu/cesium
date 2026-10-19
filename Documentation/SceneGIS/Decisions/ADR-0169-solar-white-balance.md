# ADR-0169: Fixed solar white balance in the shared display slot

- Status: Accepted; implemented, owner visual acceptance pending
- Date: 2026-10-19
- Related: ADR-0044, ADR-0154, ADR-0161, ADR-0164; SGP-0044 / SGP-0046
- Plan: [solar white balance](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-10-19-solar-white-balance.md)

## Decision

Add `SceneGISEnvironmentEffects.whiteBalance`, boolean, default true. It selects
the fixed Earth solar-spectrum white point for final display in both worlds.
The reference is Bruneton's `atmosphere/demo/demo.cc` / `demo.glsl`: convert the
extraterrestrial solar spectrum to linear sRGB, divide the resulting white by
its arithmetic RGB mean, then divide scene radiance by that normalized white
before the display curve. Reference source:
[Bruneton demo](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.cc.html).

The frozen Earth solar samples `(1.474, 1.8504, 1.91198)` multiplied by the
ADR-0044 Sun conversion coefficients reconstruct this solar integral. The
normalized white is approximately `(1.082414, 0.967556, 0.950030)`. Keep its
derivation next to the display shader and requalify it when the Earth spectrum
or conversion changes. The common luminance unit cancels during normalization.
This is the reference RGB diagonal correction, not a Bradford adaptation of
the instantaneous direct-plus-sky illuminant.

No frame histogram, scene readback, camera / Sun angle threshold or current
white-surface normalization is involved. Atmospheric reddening remains. This
does not turn already illuminated imagery into measured material reflectance.

## Integration and ordering

Publish the boolean in the existing active Globe / Planar lighting record.
The collection passes its Context to the existing color-grading preparation
hook; read the record through `UniformState.frameState`, without retaining
resources or installing another controller. No active record means identity.

Configure the LDR output source before assembling shared color grading.
The shared function performs fixed solar correction, optional existing HDR
camera temperature/tint, contrast and saturation. HDR exposure precedes it,
the selected tone curve and gamma follow once. LDR applies only fixed solar
correction before clamp/gamma; explicit artistic grading keeps its HDR-only
contract. White-point changes do not alter exposure, TAA history, metering,
bloom inputs, material values or transport. Scene imagery, unlit/emissive and
annotations receive the same global display transform; DOM UI does not.

The property uses a warm display uniform. Changing it reuses programs and
attachments. Entering/leaving an active advanced environment can rebuild the
existing display variant, just like entering/leaving explicit grading.
Disable, disconnect, failed activation and World replacement follow the existing
lighting-record lifetime. There is no additional pass, sampler or target.

## Ownership and verification

The only upstream file changed is `Scene/PostProcessStageCollection.js`, inside
the existing SGP-0044 grading and SGP-0046 display seams: pass Context and order
owned stage configuration. All implementation remains SceneGIS-owned. Reuse
those patch IDs; no copied tone mapper or source-text rewriting is allowed.

Verify actual GPU output with an independently derived solar reference, all
native/AgX curves and LDR, alpha/black, explicit grading order, dual-world
records and controller lifecycle. Verify warm resource identity, current
imagery, low Sun and bounded display-pass timing. Run full build/types for the
public property and scoped checks; owner visual judgment remains separate.
