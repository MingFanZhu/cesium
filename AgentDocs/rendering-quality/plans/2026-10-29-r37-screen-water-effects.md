# R37: Screen-space contact foam and approximate caustics

- Type: phase plan; status: technically completed; 2026-10-29.
- Owner / architecture reviewer: current task, source-based self-review.
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md).
- Entry: R36 `e467891320`; ADR-0202; no upstream change / SGP-0017 unchanged.

## Scope and source facts

The owner explicitly removes bathymetry grids and persistent shore-foam transport.
Keep FFT whitecap history and actual source-geometry underwater membership. Existing
WaterFrame publishes opaque color/depth before either water consumer. WaterSurface
already has screen-depth contact foam; RiverSurface bypasses it with a crest mask.
WaterField/RegionalField own depth maps, foam history and a refracted caustic mesh;
these are removed, together with their public Bathymetry type and example grids.

## Implementation

- Keep foamWidth, foamIntensity, causticsIntensity and underwaterDepth. Remove
  bathymetry and artistic currentFoamIntensity directly, without compatibility
  code or migration errors, as confirmed by the owner.
- Both water types use the same visible opaque-depth contact term. Keep licensed
  foam film material and FFT compression/half-life history unchanged.
- A shared fragment helper reconstructs the visible receiver and local normal
  from captured depth. Project a reference source onto the known local mean water
  tangent plane along refracted sunlight. Sample the existing actual analytic,
  wind and river waves there; estimate a local ray-footprint area ratio at the
  receiver plane using bounded metric differences. Screen derivatives provide the
  receiver normal and pixel footprint. Mean and displaced ray footprints use
  the same receiver normal, depth, source parameterization and world-aligned phase.
  This is a single-branch local focusing approximation, not accumulated photons.
- All derivative inputs are evaluated before per-pixel rejection. Reject sky,
  foreground and non-submerged receivers; bound grazing, degenerate footprints,
  light elevation, depth and focusing. Filter wave samples by metric pixel size.
  Reproduced source-cell artifacts rule out directly differentiating sampled wave
  normals. Two underwater program variants keep the disabled path inexpensive.
- Above water uses source mesh varyings and receiver offset. Underwater uses the
  retained original profile/chart to find mean level, tangent and phase. River
  BVH leaves additionally carry the three source vertex flow/speed records in
  their existing texture (7 texels/node instead of 4); no new grid or target.
- Remove the fixed-field JS/GLSL and field-specific tests; replace with GPU
  receiver/foam tests, retained geometry/whitecap regressions, simplified examples,
  public docs and browser evidence. No SDK or distribution copying.

## Validation and exit

- Calm unit focusing; real wave/sun/depth response; sky, dry, foreground and
  receiver edges; contact-foam parity without river wave/crest dependence.
- Globe/Planar local water, ellipsoid lake/channel and directed variable-level
  rivers above/below water. Pause, camera movement, LOD/pick and ownership.
- Confirm no field textures/mesh/history or constructor grid cost remain; compare
  isolated draw cost and resource counts on reproducible browser views.
- Focused dev/release GPU Specs, relevant browser cases, build/release/types,
  scoped lint/format and review before an independent local checkpoint.

## Limits

Visible opaque receivers only; missing scene depth cannot recover hidden/unloaded
geometry. Local tangent projection, screen derivatives, finite wave filtering and
single-branch focusing are approximate. No persistent shore advection, photon
shadows, transparent receivers or overlapping media. Underwater still uses the
real fixed boundary/profile and finite depth; screen data never determines membership.
Prior owner visual gates are preserved and qualified by this explicit scope change.

## Completion and handoff

Implementation and source-based technical review are complete. The
[review](../reviews/2026-10-29-r37-screen-water-effects.md) records 86 passing
related release GPU cases, the final three configuration checks, fourteen browser
cases, build/types and bounded resource/GPU costs. Owner visual acceptance remains
pending; no next phase is active. Form the independent R37 local checkpoint.
