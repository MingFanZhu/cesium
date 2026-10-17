# ADR-0165: Diffuse ground return and exposure-compensated symbols

- Status: Accepted
- Date: 2026-10-16
- Related: ADR-0044, ADR-0085, ADR-0161, ADR-0164

## Confirmed problem and scope

The owner requests brighter back-facing surfaces through physically motivated sky
and ground lighting, while preserving annotation occlusion and disabling automatic
exposure by default. The owner chooses exposure compensation for vector text/icons,
retaining the selected tone curve rather than moving symbols into a display overlay.

Vector extrusion diffuse lighting calls the same Model environment-light helpers
as native glTF and model-based 3D Tiles. Their BRDFs remain different. The existing
diffuse sky source accounts for the upper hemisphere only, whereas the physical
specular sky source already includes Lambertian ground radiance. This omits the
ground contribution on walls and downward-facing diffuse surfaces.

[UE Sky Lights](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-lights-in-unreal-engine)
separate sky capture/irradiance and indirect-light transport. The public atmosphere
reference uses ground albedo / pi for ground return. This does not justify boosting
the Sun, removing Lambert normalization, or claiming equivalence to UE's geometry GI.

## Diffuse closure

Keep the current directional Sun and upper-hemisphere sky. Add lower-hemisphere
irradiance from the existing linear ground albedo 0.1, multiplied by horizontal
direct plus sky irradiance at ground level. Use the complementary cosine-weighted
hemisphere fraction (1 - dot(normal, up)) / 2. Preserve primary-light direction,
color/intensity authority, the readable night source and surfaceRadianceScale once.
Cloud transmission affects ground direct light; receiver AO continues to affect
the resulting indirect light. The Globe uses a radius-squared projected-area factor
to bound the regional ground approximation at high altitude.

This is an analytic regional Lambertian environment closure. It does not capture
local ground texture, building-to-building bounces, or geometry visibility of each
bounce. The frozen Earth atmosphere LUT and its ground albedo remain unchanged.
The same source serves vector buildings, Models/Tiles and terrain. Upward surfaces
retain their prior values. Existing explicit diffuse IBL overrides retain ownership.
There are no additional textures, framebuffers or passes; tilted surfaces perform
additional reads of existing irradiance/transmittance and optional cloud-shadow LUTs.

## Symbol exposure contract

Compensate premultiplied linear RGB before its existing ordered composition, without
changing alpha, alpha cutoff, picking, depth, terrain anchoring or layer order.
Manual HDR exposure is canceled once; LDR uses unit compensation. Zero manual gain
retains the existing black-output behavior without introducing non-finite values.
AgX/other tone curves and optional grading continue to affect symbol colors.

When automatic exposure is explicitly enabled, use its last completed gain with
current manual gain and compensation. This adds no readback or extra metering pass.
During adaptation the next gain is only known after scene composition, so symbols
can retain one frame of exposure-ratio variation; stable/locked gains cancel exactly.
The first unmetered frame uses unit automatic gain. This history rule is explicit,
not an added settling-frame mechanism. Automatic exposure remains disabled by default.

## Verification

GPU tests cover upper/side/lower receiver energy, ground reflectance and light
authority, both worlds and native Model/3D Tiles integration. Symbol tests cover
manual exposure changes, stable automatic gain, alpha/style order, occlusion,
LDR and picking. Use the current browser view to assess actual back-face contrast
and icon colors, record added LUT cost and resource lifetime, and keep the final
visual gate with the owner. Implementation remains SceneGIS-owned; no new upstream
seam is needed by this decision.

## Globe directional diffuse amendment (2026-10-17)

The owner approves improving the algorithm before artistic gains. RAD-11 measures
a 36% underestimate of the south-facing vertical sky term in the current noon
reference. Replace the tilted-surface hemisphere fraction with cosine integration
of the existing frozen sky radiance, excluding the solar disk and lower ground
hemisphere. Direct light and the separate regional ground closure remain unchanged.

Precompute a global four-dimensional irradiance table once when Globe atmosphere
resources are created. Coordinates are receiver height, local Sun elevation,
normal inclination and normal azimuth relative to the Sun. Square-root height and
signed-square-root Sun cosine concentrate samples near ground and twilight. Runtime
uses four bilinear reads for the remaining two dimensions. The validated dimensions
are 16 heights, 65 Sun coordinates, 17 inclinations and 9 azimuths, with a 32x32
upper-hemisphere midpoint quadrature. The Sun grid spans [-0.5, 1] with a shared zero sample and denser twilight support.

Keep the original 64x16 irradiance data in an atlas alongside directional data:
649x272 RGBA16F, 1412224 bytes in place of the original 8192 bytes. Original scalar
and horizontal source queries use the original region. Surface diffuse queries
use the directional region. Store spectral irradiance and convert once at the
existing boundary. No additional material sampler, asset request, camera cache,
frame update, CPU readback, public setting, upstream seam or Planar change is needed.

Creation owns a temporary framebuffer/program and the original irradiance texture;
publish only the completed atlas, then release scratch resources. Failure releases
the candidate normally, with no fallback or retry. Environment release destroys the
atlas. The finite quadrature and interpolation remain approximations, with tests
against a denser independent directional integration rather than the old formula.
