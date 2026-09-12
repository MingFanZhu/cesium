# Discussion: Far Globe Cloud Bands

## Metadata

- Type: `discussion`; status: `resolved into A17`; date: `2026-09-11`
- Author: Architecture Agent
- Parent: [extension plan](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Phase: [A17](../plans/2026-09-11-phase-a17g-far-cloud-depth.md)
- Decisions: ADR-0043 / ADR-0048; upstream / new SGP: none

## Evidence and decision

The supplied image shows horizontal missing-cloud regions over continuous
terrain. An isolated sample at a 200 km New York camera, pitch -0.85 radians,
with a 0.2 m diagnostic native receiver reproduces the same bands. Current
frustum spans approximately 0.198 to 548,173 m with log depth. Both high and
medium reproduce. Replacing only medium's Globe AerialFS depth expression
with the precise native raw-depth overload removes the bands.

Medium producer/resolve received that correction in A13. Final AerialFS still
uses czm_readDepth followed by the vec4 inverse-projection overload; high/low
producer/resolve also retain it. Float32 perspective depth close to one loses
the original log-depth precision, producing stepped distances that reject
clouds as though they lie behind terrain.

Extend the existing precise native interface to the three Globe consumers.
No cloud placement/density/history/receiver-tolerance change, custom depth
formula, Cesium builtin edit or new resource is needed. Planar is outside
this reproduced defect. The owner tab is unavailable to the current browser
connection; this is failure-mode evidence, not exact-camera or owner acceptance.
