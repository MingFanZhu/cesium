# ADR-0167: Configurable Globe / Planar night ambient irradiance

- Status: Accepted; implemented, technical checks passed, Globe owner visual gate accepted; Planar technical checks passed, owner visual gate pending
- Date: 2026-10-17
- Related: ADR-0044, ADR-0050, ADR-0053, ADR-0165; SGP-0009

## Problem and decision

The owner approves replacing Globe's solar-angle night fill after reproducible
LDR observations showed a twilight minimum below the deep-night surface level.
Physical sky irradiance falls before the old -6/-12 degree transition supplies
ambient light. Keep physical sky, Sun, Moon, background and exposure independent.

Add `SceneGISEnvironmentEffects.nightAmbientIntensity`, default 1, finite [0, 8].
Zero disables the artistic ambient floor. The reference linear RGB irradiance
remains (0.020, 0.036, 0.060), preserving the accepted deep-night brightness.
This is a readability setting, not physical moonlight or automatic exposure.
Planar currently accepts only the default 1 and retains ADR-0050's old behavior.

At each receiver, compare the physical sky irradiance with the configured floor,
weighted by its upper-hemisphere cosine integral. For each RGB component, let
`r = physicalSky / floor`. Add
`floor * (max(1-r, 0) + max(0.25-abs(r-1), 0)^2)`.
This C1 smooth maximum keeps the sum at or above both inputs, is monotone in sky
irradiance, preserves the exact floor below 0.75 times it and gives exactly zero
fill above 1.25 times it. Independent channels avoid a saturated twilight sky
leaving dark material channels below their deep-night floor. Zero intensity or
zero hemisphere weight returns zero without division.

Terrain and model/vector diffuse receivers use their existing directional sky
lookup; ground return uses horizontal sky. Cloud body/haze use the existing scalar
sky irradiance. Height fog evaluates horizontal physical sky at its existing
representative point to determine the supplement, preserving its original daytime
ambient and directional terms. No screen luminance, time history or readback is used.
Fill enters the existing ambient domains once, before materials, AO and source
calibration. Background, atmospheric scattering, specular capture, Moon direction/
phase/strength, geometry shadows, cloud Beer attenuation and Planar stay unchanged.

## Integration and verification

Use a warm scalar uniform and the existing frame-local lighting record. Extend
only the existing SGP-0009 uniform map in `GlobeSurfaceTileProvider.js`; all
algorithm/controller/consumer code is SceneGIS-owned. No new program category,
pass, texture, framebuffer, asset request or history; fog adds one existing sky
atlas query. Update ADR-0050 by reference rather than removing its history.

GPU tests cover the floor and monotonic transition, disable/default/day identity,
surface/material/normal response, shared ambient consumers and unchanged Planar.
Check warm-resource identity, public declarations and complete build/type checks.
Review the same Globe camera over the full day with HDR and automatic exposure
off, including the previously failing dawn and dusk intervals. Visual acceptance
remains with the owner; this is regional ambient fill, not visibility-aware GI.

## Planar amendment (2026-10-17)

After accepting the Globe full-day result, the owner authorizes the same ambient
floor for Planar. The finite [0,8] API now applies to both modes. Planar uses its
existing horizontal physical sky irradiance and fixed +Z hemisphere weights;
ground return, cloud/haze and height-fog ambient share the same supplement.
The renderer already publishes the scalar; the Planar material map borrows it.
No new upstream seam or GPU resource is required. Preserve the Planar slab LUT,
Sun/Moon direction, specular capture, visibility and style contracts. This amendment
supersedes the Planar-only-one restriction above and ADR-0050's P4 angle gating.
