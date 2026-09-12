# P5: Planar Far Aerial Quality

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-12`
- Owner/reviewer: current agent under implementation and visual delegation
- Architecture review: `confirmed` for diagnosis and bounded owned-source repair
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P4 `b0ed3e2149`
- Decision: [ADR-0042](../../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md)
- Finding: [P4 far-horizon hue](../reviews/2026-09-12-p4-planar-readable-night.md)
- Upstream: consume-only SGP-0008; no new hunk planned

## Source and work

Current graph omits the private GLSL helpers. Exact source confirms Planar
surface and cloud aerial use the same analytic segment transmittance and
boundary-scattering LUT difference. The existing 300 km in-medium budget is
separate from entry distance. P4 observed a narrow distant hue band in day and
night, removed by disabling aerial; its numerical root cause is unresolved.

1. Reproduce the fixed 10 km cloud-above view and isolate cloud, surface,
   background, transmittance and in-scattering. Use actual GPU/source evidence
   to identify the defect before choosing a product change.
2. Update this plan and ADR if the verified repair changes optical semantics.
   Preserve metric/custom-CRS fixed +Z, direct Z and explicit Sun; do not invent
   a sphere, hide the horizon with a camera change or tune final RGB.
3. Add a focused failing GPU case for the demonstrated defect, repair the
   smallest owned source/generator boundary, and rerun relevant Planar optical,
   P4 night and Globe regression. Never edit generated JS or Build output.
4. Verify the original day/night view and any affected altitude endpoint;
   record bounded GPU/resource cost and lifecycle implications. Restore user
   state, review findings and create an independent local checkpoint.

## Exit and limits

The reproduced color discontinuity must be corrected with causal regression
evidence and delegated visual acceptance. New API/assets/passes/resources are
not currently justified; add a source-based decision before expanding them.
Cloud morphology, rays and directional Moon remain separate roadmap work.

## Confirmed diagnosis and repair

Actual GPU ground rays from Z=10 km show red transmittance 0.315 at 300 km,
then incorrectly rising to 0.604 at 20,000 km. The 300 km clip removes the dense
lower path as the ray becomes shallower. Complete slab transport instead gives
0.0995 at 600 km, 0.0214 at 1,000 km and zero at 20,000 km. Remove the obsolete
atmosphere length clip; analytic integration and LUT lookup have constant cost.
Cloud/fog march budgets remain unchanged. ADR-0042 records the new full-segment
contract; no LUT regeneration is needed because its boundary is already exact.

The uncapped daytime view separately exposes the existing 10:1 background/aerial
source-domain mismatch. Apply ADR-0044's accepted Globe relative aerial mapping
to Planar surface and cloud aerial, preserving coefficients, defaults and input
extinction. This updates existing public property semantics, so run full build,
build-ts and tsc. Fixed-view candidate renders establish both repairs before
source edits; GPU regression must cover each independently.

## Completion

The [P5 review](../reviews/2026-09-12-p5-planar-far-aerial-quality.md) accepts
the two causal repairs after failing/passing GPU evidence, eight regressions,
full build/types, actual near/far/high/night views and bounded GPU timing.
Cloud material/radiometry and remaining rays/Moon stay explicit successors.
The commit containing this closure is the independent P5 local checkpoint.
