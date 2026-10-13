# ADR-0155: Private WebGL material-buffer qualification

- Status: accepted for P1 prototype only; technical and owner visual qualification complete
- Date: `2026-10-13`
- Plan: [P1](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-13-p1-gbuffer-prototype.md)
- Upstream integration: SGP-0045

## Context and decision

Qualify native material data before replacing lighting. Preserve the glTF loader, geometry,
native shader stages, command selection and synchronous picking. A private Scene-bound probe
replays visible opaque commands after opaque composition into four owned RGBA16F attachments
and depth-stencil, using FramebufferManager, ShaderCache and shallow command derivation.
This explicit diagnostic replay is not the proposed production deferred submission path.

Record native diffuse/occlusion, eye normal/roughness, specular F0/type, emissive/coverage
immediately before LightingStageFS overwrites diffuse with lighting. This retains material
sampling, normal mapping and existing pre-lighting weather/specular filtering. Do not reconstruct
the original material from lit color or infer metallic from F0. All native alpha/discard/depth
operations still execute before the wrapper publishes the captured values.

Initial profile: single-frustum HDR SCENE3D, opaque/MASK Model PBR and unlit. Other ordinary
opaque commands occlude with no material record. Transparent/water commands do not enter capture.
Unsupported layered/weighted material and post-lighting style branches fail explicitly when
the probe is enabled; ordinary rendering is not restricted when the probe is absent/disabled.
The prototype is not a declaration that all CustomShader/material extensions are supported.

Samples follow the native scene target; every MRT attachment resolves separately. A resolved
normal/material at an MSAA boundary may combine surfaces. Display those diagnostic results but
do not use them for production lighting or claim per-sample correctness. A separate step must
decide how production deferred lighting handles edges. No AA default or public API changes.

## Ownership, delivery and alternatives

The probe owns targets and a diagnostic PostProcessStage; Scene destroys the probe before Context.
No material-target allocations while initially disabled, resize replaces targets, disable releases targets and
destroy detaches. Borrowed commands, geometry, textures and original programs are not destroyed;
derived shader ownership stays with native ShaderCache. Capture restores pass/framebuffer state.
SceneGIS GLSL uses the existing generator; no manual generated files or new build root.

Directly replacing main MRT now would couple material correctness, lighting semantics, effect
composition and AA in one experiment. Capturing in JavaScript by replacing arbitrary shader text
or patching prototypes is rejected. The native Scene callback provides log/HDR command selection
without copying that logic. Only three narrow Scene lifecycle/submission seams and one material
sampling purpose are added under SGP-0045.

## Validation and upgrade

Real GPU tests cover native material values, alpha-mask discard, non-Model occlusion, MRT resolve,
linear depth, lifecycle and explicit profile errors. Qualify original Bistro with fixed conditions,
record extra draws/storage and paired timing; existing screen-space effects remain independent.
Check native Scene ordering, LightingStageFS overwrite position and ShaderCache derivation on
upstream upgrades. Production adoption, compressed layout and coverage expansion require new
evidence and amendments. The owner accepted the prototype on 2026-10-13 and authorized the P1 checkpoint.

Empty native frustum lists skip capture. Native preRender invalidates readiness and postRender
clears previously owned targets if capture did not run, so unloaded scenes cannot expose stale
material/depth. The probe unregisters both events before releasing resources.
