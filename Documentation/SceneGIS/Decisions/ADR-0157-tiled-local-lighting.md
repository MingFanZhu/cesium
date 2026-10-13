# ADR-0157: Tiled Local Lighting

- Status: accepted for the WebGL2 deferred experiment
- Date: 2026-10-13
- Related: ADR-0090, ADR-0156; SGP-0019, SGP-0047
- Owner decision: A, preserve light APIs and expand to 256 descriptors

## Context

P2 reused the bounded 16-light material loop to qualify deferred composition.
That loop did not cull lights per pixel. A Bistro profile also identified repeated
derived-program string-cache lookup in local-light receivers, including shadow
casters, as a separate CPU submission bottleneck.

## Decision

Keep PointLight/SpotLight and collection call forms, coordinate conventions,
finite-range/cone attenuation and BRDF from ADR-0090. Expand descriptor capacity
to 256 including hidden lights. Overflow remains an explicit error.
Replace fixed uniform arrays with one RGBA32UI table, using native Texture and
Sampler. Four rows hold 256 sets of four parameter texels as exact float bits,
decoded by uintBitsToFloat. The following rows hold one offset/count header per
tile; the final region packs four uint indices per texel. Texture width is 256.
The prototype with three separate textures exceeded the 16 fragment-sampler
limit in a native clearcoat/sky/probe combination; one table preserves the data
without raising the hardware sampler requirement.
This protocol targets WebGL2; unsupported contexts fail explicitly.

CPU builds conservative camera-space light bounds without depth readback.
Range spheres use near-clipped enclosing boxes projected with the native camera
matrix. A one-pixel margin covers existing subpixel temporal jitter. Tile size
targets 32 physical pixels. Normalized viewport addressing also supports capture
viewports; prepare uses their camera and restores the main-camera table afterward.
Preserve light order, range and cone tests in shading. Never cap candidates within
a tile or silently drop lights. Camera-inside and high-overlap cases remain correct
even when every tile contains every light. Complete tiles use the identically
ordered global table directly, without storing or fetching redundant indices.
This avoids the measured index overhead without discarding any contributions.

Opaque deferred PBR and eligible ordinary/transparent forward receivers share
the table and iteration helpers. This is tiled deferred/forward shading, not depth
clustering, local-light shadows or GI. The private street comparison can select
the full global list from the same table; this is diagnostic, not a public mode.

Collection owns the table texture and CPU arrays. Empty/hidden collections
release them; resize updates the grid and grows capacity as needed; explicit/Scene destruction releases
resources before Context. Descriptors remain borrowed and resource-free.
The parameter table is 16 KiB. At 1920x1080, 60x34 tiles with
nearly complete lists require about 1.99 MiB of indices before capacity rounding.
Headers use 32 KiB including row padding; fully complete lists need no indices.
Capacity grows and remains until the collection becomes inactive or is destroyed.
Only one fragment sampler is added.
No new geometry draw, framebuffer or per-light GPU resource is introduced.

Owned receiver metadata caches derived programs by source ShaderProgram identity;
native ShaderCache retains ownership. SGP-0047 passes explicit caster context
through Scene's existing executor and skips local-color derivation for casters.
It does not change the native shader cache or shadow geometry path.

## Verification and maintenance

GPU equivalence against the global list must cover 256 lights, spot cones,
tile/near boundaries, projection modes, large coordinates and mixed receivers.
Verify zero-light release, resize, mutation, capture restoration and destruction.
Compare dispersed and overlapping lamps at identical street quality settings;
report CPU submission and GPU lighting separately. Many overlapping sources can
cost more than the global loop, and tile lists do not eliminate shadow costs.
Owner visual acceptance remains a separate stage gate.

This supersedes ADR-0090's 16-light uniform storage and texture-free collection
implementation within this experiment; its energy and receiver semantics remain.
