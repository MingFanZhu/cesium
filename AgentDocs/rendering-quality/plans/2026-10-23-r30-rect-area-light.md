# R30: Rectangular area lights

## Metadata

- Type: phase; status: completed; date: 2026-10-23.
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md).
- Owner authorization: add a rectangle to the existing lighting system.
- Baseline: `71b47223a4`; branch: `feature/rect-area-light`.
- Architecture / execution / review: current task, self-review.
- Decision: ADR-0186; upstream-owned changes: none planned; SGP: none.

## Source facts and design

Point/spot descriptors share the collection, camera preparation and a single
RGBA32UI tiled table (ADR-0090/0157). Forward, deferred, terrain and transparent
Phong receivers use the same owned shader modules. The collection owns the table;
descriptors are mutable, borrowed CPU objects. Build automatically discovers
public modules and converts owned GLSL; generated barrels/shaders stay untracked.

Add `SceneGISRectAreaLight` with position, emission direction, up, width/height,
linear color, radiance intensity, center-based finite range, show and twoSided.
Normalize an orthogonal frame in double precision before eye-space packing.
Validate independent nonzero direction/up, positive sizes and live edits.
Use horizon-clipped polygon integration for diffuse and the published isotropic
GGX LTC fit for specular/clearcoat. Phong specular maps its exponent to GGX
roughness; anisotropic area-light specular uses the isotropic fit explicitly.
Point/spot shading and intensity units remain unchanged. No local shadows,
textured emitters, GI solver, or implicit visible light geometry.

Retain the first four parameter rows and add two rectangle-axis rows only while
rectangles are active. Pack the two 64x64 float LTC tables into 32 more rows of
the same sampler. Upload immutable LUTs on texture allocation or return from the
point-only layout, whose headers may overwrite their rows. No extra
geometry/fullscreen passes, framebuffer, or per-frame GPU resource. Keep original
ordered candidates/camera capture lifecycle and release on empty/hidden collection.
Published reference data and license are pinned and documented in ADR-0186.

## Implementation and bounded evidence

1. Public descriptor/validation/collection and parameter/LUT packing.
2. Shared diffuse, PBR, clearcoat and Phong area shading; SSIL diffuse source.
3. API/GPU Specs for input mutation, energy/size/orientation, horizon clipping,
   roughness/highlight shape, tiled equivalence, both Worlds, forward/deferred,
   native receivers and resource reuse/destruction. Reuse existing light regressions.
4. Independent local example with both Worlds and Chinese size/orientation controls;
   browser checks, representative images, bounded warm timing/storage evidence.
5. Dev/release builds and focused tests, public types, scoped lint/patch audit;
   review, handoff and independent local checkpoint. Owner visual gate stays explicit.

## Exit and risks

Real rectangular highlights and size-dependent diffuse illumination must be visible,
not a point-light cluster. Published LTC is an isotropic approximation, and legacy
Phong is mapped rather than exactly fitted. Center-based range intentionally fades
the integrated result. Local occlusion and calibrated photometric units are excluded.
No change to unrelated rendering visual gates or the WebGPU branch.

## Completion

[Technical review](../reviews/2026-10-23-r30-rect-area-light.md) is complete.
Dev/release each pass 31 focused cases; one old bloom expectation fails identically
on the baseline. Four both-world/product E2E cases, complete builds and public
types pass. Reviewed images and bounded timing/storage evidence are recorded in
the review. The independent local checkpoint is `02644b6ecc`. The owner visually
accepts R30 on 2026-10-23 and requests the acceptance record commit, completing
the phase gate. Merge remains pending. No subsequent phase is activated.
