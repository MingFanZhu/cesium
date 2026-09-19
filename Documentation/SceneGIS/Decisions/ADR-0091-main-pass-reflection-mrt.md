# ADR-0091: Main-pass Reflection MRT

- Date: `2026-09-19`; status: `accepted; implemented and technically verified`
- Phase: [R12](../../../AgentDocs/rendering-quality/plans/2026-09-19-r12-main-pass-reflections.md)
- SGP: `SGP-0016`; amends ADR-0086's unconditional shaded replay

## Decision

Preserve forward material lighting and all public reflection options. For the qualified single
native frustum, attach owned floating-point material outputs alongside borrowed native color and
depth attachments. Preserve the native sample count. Store each evaluated reflection direction,
roughness, final linear response W and existing weighted environment contribution E*W. Main color includes E*W.
The screen resolve replaces this contribution by `color + confidence * (hit * W - E*W)`, independently
for base and clearcoat. This is the algebraic equivalent of material radiance substitution, not an
unweighted additive reflection. Direct light and emission remain unchanged.

Response includes native Fresnel/BRDF, IBL factor, AO, clearcoat attenuation and supported styling.
Model CPU styling and model color transform W explicitly. Main-pass sources and depth are copied
only after opaque completion; tracing/filtering run before water, OIT/translucency and environment
composition. Water borrows the same immutable opaque snapshot. AO retains its existing prepass.

Use four RGBA16F outputs for base materials and seven when clearcoat is present. Resolve every
multisample color attachment separately, including borrowed main color, into owned single-sample
textures. Resolve weighted environment energy directly, avoiding a product of independently averaged
weights and radiance at MSAA edges. Blend only the signed replacement delta into native color;
preserve each original color sample and alpha. Mask the reflection source mip chain with resolved
opaque coverage so the native background cannot become an opaque reflection source.
Resolve depth to owned storage. Borrowed native attachments are never cleared, resized
or destroyed by the reflection owner; auxiliary targets follow effect resize/disable/destroy rules.

Keep ADR-0086 replay when native multi-frustum ordering, classification/translucent Globe, cleared
Globe depth (`depthTestAgainstTerrain=false`), blended
opaque drawing, unsupported post-lighting branches or attachment limits prevent this exact path.
Those existing contracts need independent integration before broader qualification. No automatic
quality reduction, new public switch, history, stale geometry or speculative retry is introduced.

## Alternatives, integration and validation

A full deferred renderer would expand changes into unrelated material/lighting paths. Integer
packed material attachments cannot preserve the current device's 4x MSAA (queried supported sample
counts are empty), so this phase uses native floating-point attachments and explicit resource costs.

SGP-0016 retains Scene scheduling/derivation and native IBL seams, adding only material response and
supported post-lighting transformation hooks. Owned JS/GLSL use existing build and Spec discovery.
Recheck native framebuffer ownership, multisample binding cache, opaque/water/OIT order and native
material algebra during upgrades. Strict GPU regressions, resource lifetime, real-scene timing,
release/types and patch audit are required; owner visual review remains the picture-quality gate.

## Measured tradeoff

In the qualified real scene, MRT removes 1574 capture draws and reduces paired natural-loop frame
time by 25–27%. Four-sample MRT auxiliary storage increases SSR-owned target storage from roughly
67 to 187 bytes per pixel for base materials, or 299 bytes per pixel with clearcoat. These include
the reflection capture, filtering, depth and radiance mip chain, exclude borrowed native resources,
and are approximate GPU storage rather than a driver allocation measurement. At 1097 x 822,
the base-material increase is about 103 MiB. This phase trades memory/bandwidth for fewer geometry
submissions and full material evaluations. It does not establish acceptable total frame rate.

Technical evidence and retained integration limits are recorded in the
[R12 review](../../../AgentDocs/rendering-quality/reviews/2026-09-19-r12-main-pass-reflections.md).

R14 amendment: [ADR-0093](ADR-0093-main-pass-ambient-occlusion.md) promotes the attachment manager
to shared lighting MRT. AO may add one indirect output, consume main depth and correct the radiance
source before SSR. It can also use MRT independently with SSR disabled; native MSAA is preserved.
