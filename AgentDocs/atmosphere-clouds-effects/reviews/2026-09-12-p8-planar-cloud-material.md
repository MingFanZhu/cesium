# P8 Planar Cloud Material Review

## Metadata

- Type: `review`; status: `approved`; created/updated: `2026-09-12`
- Reviewer/implementer: current Architecture / Execution role
- Target: [P8 plan](../plans/2026-09-12-phase-p8-planar-cloud-material.md)
- Predecessor: P7 `3a93585efd`; upstream-owned files: none; SGP delta: none

## Findings and disposition

- Fixed, high: legacy generated RGBA assets, 10–30 km threshold morphology
  and a single deep cumulus layer caused the remaining macro coarseness.
  Both worlds now execute the audited authored density algebra and layer
  descriptors from the existing material library. Planar uses R8 shape/detail,
  channel weather, height-dependent erosion and optional 2D turbulence.
- Fixed, high: Planar receives metric XY and absolute Z, without sphere/haze
  helpers. Two reusable CPU vec2 origins reduce XY modulo the shared 240 km
  texture period before float upload. Cloud/shadow samples preserve horizontal
  wind translation, direct Z and phase during small camera movement at large XY.
- Fixed, high: shadow CPU support, visual support, non-casting high layers and
  exact-zero occupancy now match the new material. High-layer density may
  survive zero shape, so its occupancy classifier cannot reject by shape alone.
- Fixed, high: the initial material-only candidate's legacy radiance gain 48
  flattened daylight tops. The recorded P8 amendment converts Planar Sun/sky
  to physical RGB irradiance and maps intrinsic cloud radiance through the
  scene background scale and independent cloud scale, as Globe does.
- Fixed, medium: experimental Planar controls now expose the same dimensionless
  cloudDensity default 1/range 0–64 and cloudRadianceScale default 1 as Globe.
  JSDoc, example defaults and controls explicitly migrate the old values.

The Globe algorithm, base-volume sampling, raster footprint, layer values,
lighting, temporal rules and texture selection remain intact. Planar retains
explicit metric volume/2D mip filtering, continuous subpixel detail fade,
P6 quadrature and P7 local solar/Beer integration. Geometry shadow switches
and geometry lighting ownership are unchanged.

## Validation

17 focused cases pass (15 actual-GPU cases and two source/API contract cases):

- P8 authored-density and physical-incident oracle, fixed-Z boundaries, mixed
  overlap, high-layer shadow exclusion, CPU material phases, real R8 mip
  dimensions/bytes, replacement release and final destruction.
- P6 near thin support/full 300 km integration; P7 projected-footprint solar
  filtering/top clipping and origin-relative Beer remainder.
- P2 real surface/shadow atlas, large XY, warm history and exact lifetime;
  exhaustive density versus conservative occupancy; failed mip candidate cleanup.
- Both-world controlled material validity and raw radiance/alpha/depth isolation;
  pinned Globe reference textures and calibration; Planar scattering reference.
- P1 camera/wind history; P4 physical night ambient; immutable final medium
  composition; off-centre Planar MRT across both frusta/depth variants/presets.
- Constructor contract and shared authored-material source contract.

Existing fixtures are migrated where units, support, texture formats or shader
dependencies changed. P2 uses the new default density instead of old 0.001;
mixed visual/shadow support is compared separately from matching density;
physical incident and background-scale oracles include the explicit conversion.
Two CPU-only tests of removed legacy density/layer copies are replaced by the
actual GPU material/support checks. Failed intermediate expectations do not
alter product thresholds or weaken the new physical contract.

Delegated visual review covers the owner's low-Sun view, daylight above clouds,
high-quality mixed layers and ground/night. The large soft clumps are replaced
by finer cloud bodies and erosion, with restored daylight top detail and local
shadow structure. The fixed-Z horizon and projected high sheets remain planar.
Finite-resolution sampling grain remains visible; this is not a zero-grain or
pixel-identical Globe appearance claim. Night retains authored sample geometry
colour and ambient-only cloud illumination; directional Moon is still deferred.

Six GPU timer samples at the retained medium ground view, 862x575 Cloud MRT
and 1724x1150 resolved output, RTX 3060 Ti through ANGLE D3D11:
2.981, 2.749, 1.928, 3.034, 3.217, 2.786 ms; median 2.884 ms. This is one cloud
pass, not FPS or an interleaved P7/P8 speedup claim. Texture storage is
7,364,997 bytes (7.02 MiB), down from the legacy Planar 15,691,189 bytes.
No extra pass, FBO, history or sampler slot is added. The origin uniforms reuse
two CPU Cartesian2 objects; resource ownership and failed-candidate release hold.

Full build, build-ts, tsc, scoped ESLint/Prettier and upstream audit pass.
Build-ts retains existing unrelated JSDoc warnings. Full AgentDocs markdownlint
passes; full AgentDocs Prettier retains the same 16 unrelated historical files.
Reused asset names/provenance and packaging paths remain unchanged, and actual
runtime requests load the pinned assets successfully. No upstream or generated
file is edited or committed.

## Handoff

Architecture accepts P8 under the owner's delegated visual-review contract.
The owner's camera, Sun/Moon and compatible settings are restored; density and
cloud brightness use the explicitly migrated defaults 1/1. The formal page is
ready with no reported errors. The containing commit is the independent local
checkpoint; no push. Ground-bounce parity, rays and directional Moon remain
successors; finite-resolution grain is a retained quality limit. No owner gate
is pending and no successor is activated in this commit.
