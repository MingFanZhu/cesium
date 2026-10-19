# ADR-0154: HDR color grading in native tone mapping

- Status: Accepted
- Date: 2026-10-12
- Phase: rendering-quality R24; upstream seam: SGP-0044

## Context and decision

Cesium 1.144 executes ordinary PostProcessStages after tone mapping. White balance there
cannot retain unclipped HDR color. An extra HDR stage would add a full-size target and
draw. Instead, keep all five native tone curves and add one explicit guarded function call
after exposure and before the curve in each native shader. PostProcessStageCollection
assembles the owned shader and uniforms on the fresh native stage before its first update.
No source replacement, prototype override or copied tone mapping implementation is used.

`SceneGISColorGrading` is an optional Scene-owned controller, disabled by default. Existing
APIs/defaults are unchanged. It supports daylight camera white temperature (4000–25000 K,
neutral 6500 K), tint (positive magenta), contrast and saturation. Temperature increase
warms the image; it does not recolor the scene light. A CPU Bradford adaptation matrix
maps the selected daylight white to the neutral white in linear Rec.709. The daylight
locus follows the CIE D-series formula described in Wyszecki/Stiles, also documented by
[Colour](https://colour.readthedocs.io/en/develop/generated/colour.temperature.CCT_to_xy_CIE_D.html).
The neutral setting bypasses adaptation exactly. Tint offsets daylight chromaticity y;
it is an artistic dimensionless control, not a calibrated camera tint measurement.

Contrast acts on luminance around exposed linear middle gray 0.18; saturation mixes
against Rec.709 luminance. Black remains black; out-of-gamut negative RGB is clipped.
Output alpha, tone curve and native inverse gamma remain untouched. Grading is downstream
of TAA, automatic metering and bloom; it cannot feed back into metering or temporal history.
Bloom generation is unchanged, while its composited color receives the same grade.

## Ownership, cost and compatibility

The controller binds once to a live Scene collection; duplicate binding and invalid
parameters fail atomically. Active grading requires HDR. Disable/destroy returns to the
unmodified native shader; Scene collection destruction owns remaining controllers.
Parameter changes request rendering and update uniforms, without resetting TAA/SSR or
rebuilding shaders. Enable state and native tone mapper/exposure variant changes may
rebuild the native stage. No additional texture, framebuffer, pass or CPU readback exists.

The public module and owned GLSL use existing barrel/types/GLSL generators. Rebuild and
verify development/release exports and types. SGP-0044 covers only the collection and the
five native tone shaders; retire it when native HDR grading provides an equivalent hook.
Specs cover actual GPU color behavior, identity, all curves, exposure and lifecycle;
street E2E and bounded GPU timing cover integration. Final appearance needs owner review.

Presets are application configuration and remain in the example; the engine does not
change lighting, exposure, time or select a look automatically. Global grading does not
replace light transport, sky occlusion, local exposure or mixed-illuminant correction.

## 2026-10-19 amendment: fixed solar white balance

[ADR-0169](ADR-0169-solar-white-balance.md) reuses this display hook for the active
environment's fixed solar white point in HDR and LDR. It precedes optional manual
grading; the manual controller remains HDR-only and disabled by default. SGP-0044
passes Context to preparation and follows SGP-0046's display-source selection.
Without an active environment or manual controller, the native shader is unchanged.
