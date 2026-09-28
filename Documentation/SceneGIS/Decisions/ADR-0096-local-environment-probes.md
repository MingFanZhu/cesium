# ADR-0096: Local Environment Probes

- Date: `2026-09-28`; status: `accepted`
- Phase: [R17](../../../AgentDocs/rendering-quality/plans/2026-09-28-r17-local-probes.md)
- SGP: `SGP-0024`; builds on ADR-0085/0086/0093

## Decision

Keep forward PBR and existing MRT. Add a Scene-owned, explicitly captured collection
of at most two rigid-box probes. Placements use ordinary world matrices in both worlds.
Complete loaded standalone Models are explicit borrowed sources; camera-selected tile
lists are insufficient for offscreen capture and are not accepted as complete sources.

Capture six 90-degree HDR views with an independent Camera during a requested normal
render. Reuse native model commands, alpha discard, material evaluation and native
ShadowMap for one capture-only directional target when native shadows are enabled.
This target never replaces the main atlas. Restore frame state, camera uniforms,
planar light origin and local-light transforms in finally. Screen-space effects and
local probe feedback are excluded. Existing physical sky supplies the background.
Only complete candidate maps replace previous results; failures reject the request,
release candidates and never silently retry. Static frames do not render probe geometry.

GGX filtering reuses native ConvolveSpecularMapFS functions from the pinned baseline;
the owned main additionally filters sky coverage. A small cosine-filtered visibility
cube attenuates default sky diffuse only. Box-projected radiance replaces sky before
native BRDF weighting and SSR hit substitution, including clearcoat. Authored IBL maps
retain priority. Four additional samplers support two radiance and two visibility cubes;
no new full-resolution G-buffer or attachment is introduced.

Probe visibility describes the capture point, not each receiver. GTAO remains the
contact-scale term. Box projection and overlap fade are approximations, especially
for mirror-flat surfaces or volumes crossing walls. Captured surface lighting retains
existing direct/sky lighting without diffuse bounce or recursive probe feedback.

## Alternatives and limits

Full deferred conversion does not supply offscreen visibility by itself. Reusing only
the viewer's culled commands omits reflectors behind the viewer. Offline baking was
offered; the owner explicitly selected runtime capture after loading or light edits.
Automatic streaming capture, automatic invalidation, transparent capture, cloud capture,
multi-bounce transport and a dense leak-free probe field remain outside this phase.
Manual capture may stall a frame and must be measured separately from sampling overhead.

## Ownership, delivery and qualification

The collection owns maps and capture resources; models and descriptors are borrowed.
Scene destruction releases it before Context. Removal frees corresponding maps.
GLSL, exports and declarations follow the existing generators; no generated file edits.
SGP-0024 covers Scene scheduling/destruction and two native IBL shader libraries.
Upgrade checks include native Model command submission, ShadowMap derivation, cube face
orientation, GGX roughness convention and SSR/AO material-energy composition.

Require both-world GPU pictures, state restoration, masked visibility, direct/emission
isolation, source precedence, no capture in clean frames, lifecycle and bounded timings.
Independent example and Bistro controls support owner visual review.

Reference: [Epic reflection captures](https://dev.epicgames.com/documentation/en-us/unreal-engine/reflections-captures-in-unreal-engine)
describes capture reprojection, local blending and the limitations of box approximations.
