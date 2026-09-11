# P4: Planar Readable Night

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-12`
- Owner/reviewer: current agent under implementation and visual delegation
- Architecture review: `confirmed`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P3 `9d21e17de0`
- Decision: [ADR-0050 Planar amendment](../../../Documentation/SceneGIS/Decisions/ADR-0050-globe-readable-night-skylight.md)
- Upstream: consume-only SGP-0008 and SGP-0010; zero new hunk

## Source and design

Current graph has no private GLSL symbols; exact source confirms the shared
readable-night helper is present but unused in Planar. The P2 surface/model
helper, Planar cloud incident irradiance and height-fog ambient are the three
existing source consumers. Model shaders delegate to the surface helper.

1. Reuse the frozen Globe RGB and -6/-12 degree transition with fixed +Z up.
   Add the source once to Planar surface/model sky, cloud incident sky before
   its existing solar normalization, and fog ambient. Retain direct-Z height,
   existing above-atmosphere surface cutoff and source calibration.
2. Keep direct Sun, Beer production, native geometry shadows, fog directional
   source, background/aerial, HDR and authored model light/SH/emissive unchanged.
3. No API, uniform, asset, program/pass, texture, FBO, history or byte increment.
   Moon geometry and directional moonlight remain a separate successor.
4. Build GLSL through the existing generator; never edit generated shader JS.
   Extend actual-GPU Specs for twilight/day identity, fixed-Z invariance,
   surface/model and cloud/fog ambient, Beer independence and finite storage.
   Replace the historical Planar fog identity assertion with the new contract.
5. Inspect the direct Planar day/twilight/night views, retain user state, review
   resource/cost implications, run relevant regression and ownership checks.

## Exit

Actual GPU and delegated visual review must establish readable cool terrain,
model and cloud contrast without a final-color lift or daytime change. Record
findings, validation and remaining roadmap; create an independent local phase
checkpoint before activating a successor. No repeated owner acceptance gate.

## Completion

The [P4 review](../reviews/2026-09-12-p4-planar-readable-night.md) accepts the
source/GPU/resource/visual contract and records 5/5 regression, build and
ownership evidence. Extreme-horizon aerial hue, cloud material/detail, rays
and directional Moon remain explicit successors. The commit containing this
closure is the independent P4 checkpoint; no push or owner gate is pending.
