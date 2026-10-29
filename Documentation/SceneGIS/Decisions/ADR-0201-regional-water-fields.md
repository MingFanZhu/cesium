# ADR-0201: Explicit regional water fields

- Status: accepted and implemented; 2026-10-29.
- Related: ADR-0196, ADR-0199, ADR-0200; SGP-0017 unchanged.
- Phase: [R36](../../../AgentDocs/rendering-quality/plans/2026-10-29-r36-regional-caustics.md).

Extend SceneGISWaterSurface.Bathymetry with modelMatrix for regional ellipsoid
water and SceneGISRiverSurface in either World. Require a copied rigid upright
frame and metric XY bounded to +/-4096 meters. Samples include rectangle endpoints;
row-major Float32Array depths are signed offsets down frame Z from the actual
interpolated mean surface: positive wet, zero/negative dry. Existing local-plane
descriptors retain their contract.

Prepare fixed maps from original geometry independently of visible LOD. Mean
surface, original phase, geodetic tangent and river flow are sampled once. Consume
existing wind/current FFT textures, refract their actual displaced surface onto
the explicit bed and form continuous receiver/source area ratios. This extends
the local method without a new screen target or independent animated pattern.

Opaque receivers above and below water use the same eye-to-field transform, bounds
and wet mask. Resources are surface-owned; wave ownership is unchanged. Camera
movement never regenerates the field and fixed time reuses it. Source edits require
reconstruction. Field sampling and local optical transport remain approximations,
not global light transport or hydraulics.
