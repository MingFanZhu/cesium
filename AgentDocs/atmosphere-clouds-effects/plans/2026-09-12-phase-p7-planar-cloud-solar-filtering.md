# P7 Planar Cloud Solar Filtering

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-12`
- Owner: current Architecture / Execution role; architecture review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P6 `2ebce1700f`
- Decision: [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Review: [P7](../reviews/2026-09-12-p7-planar-cloud-solar-filtering.md); upstream/SGP delta budget: zero

## Source facts and bounded design

P6 fixes primary integration aliasing but leaves coarse material/flat lighting
open. The Planar secondary Sun function still passes its entire integration
step as the material footprint, unlike both the corrected primary path and
Globe. A kilometre Sun step therefore averages the shape volume into mips whose
values can fall below the density threshold, erasing internal solar extinction.
The live optical-depth probe contains 34.85% effectively zero values among
pixels with opacity above 0.1; that observation motivates a controlled density
test, not an assertion that every zero is wrong.

Pass the existing primary projected footprint explicitly into the Planar Sun
function and use it only for material LOD. Keep actual secondary step length
for Beer integration. Density/presets, assets, public calibration, atmosphere/
sky/night equations, history, resource topology and Globe stay unchanged.
The final local/Beer split below supersedes the initial filtering-only schedule.

### Visual correction before acceptance

The initial filtering-only candidate passes the thin-column test but exposes
low-Sun stripes: three full-segment secondary samples alias restored material.
That candidate is rejected for visual quality. Supersede its full-segment
schedule with consecutive local intervals (initial 100 / tier-Sun-count metres,
doubling, same 2/3/4 sample count). Clip them to actual cloud support and report
their complete covered distance. Reuse the existing current-frame Beer atlas
only for the remaining depth, as Globe does; never double-count local distance.
With cloud shadows off or outside atlas coverage, keep local self-shadowing,
matching the retained Globe division of work. Cirrus remains non-casting.

Planar Beer coordinates use the existing CPU camera-relative shadow-origin
vector (XY only) plus local cloud sample XY; Z remains absolute. Add one private
vec3 uniform callback borrowing that vector. No new allocation, atlas owner,
pass or public switch. Both local filtering and actual atlas/offset/remaining
depth need focused GPU evidence. Explicitly verify low-Sun stripes disappear.

## Verification and exit

- A real mipmapped thin-density volume must cast solar extinction at a small
  projected footprint. The old step-as-footprint mutation must fail; a large
  explicit footprint must still filter the same subpixel detail.
- Focused integrated cloud lighting and radiance-scale checks plus relevant
  actual-Planar composition regression. Reuse P6 geometry/occupancy evidence
  where this change cannot affect transmittance or primary depth.
- Same-view day/low-Sun cloud-body observation and bounded GPU timing. Check
  sampling speckle; do not claim all coarse material resolved from this repair.
- Build, scoped lint/format, documentation/ownership checks and separate local
  checkpoint. No repeat owner gate; remaining material topology stays open.

## Completed handoff

Architecture accepts the final local/Beer design after seven relevant GPU
checks, day/low-Sun visual comparison and bounded camera translation. Full
build, build-ts, tsc and scoped ESLint pass; build-ts keeps existing unrelated
JSDoc warnings. Documentation formatting/lint and upstream audit are recorded
in the review. No upstream or generated files change; resource allocations
remain identical. The existing atlas adds approximately 1.237 ms median to the
cloud pass in the fixed medium view (not a full-frame timing claim).

The filtering-only candidate is superseded by the verified combined design.
Owner camera, effects and lighting are restored on the formal P7 page, ready
with zero reported errors. The commit containing this handoff is the separate
local checkpoint. Coarse macro material/detail and radiometric parity remain
open and take priority over the later rays/Moon roadmap. No owner gate is pending.
