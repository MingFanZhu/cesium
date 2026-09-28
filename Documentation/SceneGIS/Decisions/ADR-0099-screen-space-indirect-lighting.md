# ADR-0099: Optional Screen-space Indirect Lighting

- Date: `2026-09-28`; status: `accepted; prototype implemented`
- Phase: [R20](../../../AgentDocs/rendering-quality/plans/2026-09-28-r20-screen-space-indirect-lighting.md)
- Upstream integration: SGP-0026; extends ADR-0091 / ADR-0093

## Decision and reference

Keep forward PBR and reuse main-pass lighting MRT. Add an experimental, opt-in,
Scene-owned `SceneGISScreenSpaceIndirectLighting`. Estimate one finite-distance
diffuse bounce using visibility bitmasks; SSIL is a bounded form of screen-space
GI, not a separate guarantee of complete transport.

Algorithm reference: Olivier Therrien, Yannick Levesque and Guillaume Gilet,
[Screen Space Indirect Lighting with Visibility Bitmask, v2](https://arxiv.org/abs/2301.11376v2).
Use the published finite-thickness, 32-sector, newly-visible-sector formulation.
The WebGL2 shader is an original implementation, not a vendored engine or SDK.
No third-party source code or binary assets are copied.

## Data and lighting boundary

Two extra RGBA16F attachments capture direct diffuse plus emission, receiver diffuse
response, and two octahedral normal coordinates. Source diffuse uses native material
diffuse, F0 energy retention and current shadowed directional/local irradiance, with
a view-independent Lambertian approximation. Receiver response includes material
occlusion, clearcoat transmission and supported linear model/feature styling.
No sky IBL, direct specular or previous SSIL is bounced. Non-PBR and unlit geometry
occlude but neither emit nor receive. This deliberate initial scope avoids treating
arbitrary final scene color as diffuse radiance.

The estimator integrates source color by newly covered visibility sectors, receiver
and emitter orientation and bounded distance. A bilateral full-resolution result
multiplies the receiver response and is added once to linear HDR. GTAO continues
to affect existing environment energy only; it does not re-occlude the traced bounce.
SSR may reflect the resulting opaque color, but SSIL never consumes SSR or itself.
Compose before water, transparency, aerial effects and tone mapping; preserve alpha.

## Runtime and resource contract

Globe/Planar share eye coordinates, including large-coordinate and orthographic
reconstruction. Main-pass single-frustum HDR/WebGL2 is required. Unsupported
classification, post-lighting branches and insufficient attachments explicitly fail
before main geometry. No silent fallback, geometry replay or auto quality reduction.
SSIL alone uses three outputs; with AO four; base SSR six/seven without/with AO.
Clearcoat SSR requires nine/ten and is outside the eight-output prototype budget.

Half-resolution is default; stable spatial sampling plus bilateral reconstruction
has no independent history. Optional TAA remains caller-owned. Disabled creates no
resources and retains previously allocated resources; resize replaces owned targets;
destroy releases them. Borrowed color/depth and scene models remain untouched.
Native MSAA color samples remain intact; resolved auxiliary normals at coverage
edges are an approximation, not per-sample GI. With existing AO/SSR at half
resolution, incremental owned storage is 26 bytes/pixel at one sample, or 90 at
four samples. Standalone SSIL also owns opaque color/depth and linear depth.
SSIL never requests hidden convergence frames.

## Integration, delivery and acceptance

SGP-0026 adds Scene scheduling/destruction and narrow Model lighting/styling calls.
Owned MRT and shaders carry all algorithms. Existing GLSL, barrel, Specs, release
and type generators discover the new files; generated outputs are not edited.
Validate material semantics, real GPU transfer/occlusion, no extra geometry, independent
AO/SSR, MSAA, lifecycle and measured cost. An independent both-world example and
optional Bistro control support owner visual review. Screen-space omissions and
finite-thickness leaks remain documented limitations.

Technical evidence and limitations: [R20 review](../../../AgentDocs/rendering-quality/reviews/2026-09-28-r20-screen-space-indirect-lighting.md). Owner visual acceptance remains pending.
