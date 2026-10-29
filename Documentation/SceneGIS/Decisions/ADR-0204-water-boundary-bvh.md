# ADR-0204: Indexed finite underwater boundaries

- Status: accepted and implemented; 2026-10-29.
- Related: ADR-0199/0200/0202; [R38](../../../AgentDocs/rendering-quality/plans/2026-10-29-r38-water-boundary-bvh.md).
- Upstream-owned files / SGP: none; SGP-0017 unchanged.

Replace the flat shoreline scan and 256-edge ceiling with a static 2D BVH of the
original source edges, including all holes. Up to four edges per leaf, median
split on the longest bounds axis, depth-first nodes with escape links. CPU camera
parity and GPU finite-ray queries share this immutable index; CPU retains source
double coordinates. No geometric simplification or screen-derived membership.

One lazy nearest RGBA32F texture packs two texels per node (bounds, escape/leaf
offset/count) followed by one texel per edge. Linear addressing spans a near-square
texture; memory includes row padding. Bounds alone receive a conservative FP32
roundoff margin. Leaves retain the existing edge tests. Positive-X parity and
nearest ray candidates are culled together, with profile paths omitting redundant
parity. Rational chart slab inequalities preserve curved and orthographic rays.
Dynamic traversal terminates only at actual node count, never a silent visit cap.

maximumUnderwaterBoundaryBytes is a constructor snapshot, default 8 MiB and at
most 64 MiB. Exceeding bytes or device texture dimensions fails explicitly.
underwaterBoundaryByteLength reports allocated GPU index bytes (zero until first
active underwater draw). Changing source geometry requires reconstruction; camera,
depth and style changes reuse the index. The independent prepared-profile budget
of 1024 triangles remains, rather than silently broadening profile complexity.

Underwater owns the index texture and existing program variants; no new rendering
pass/target or native hook. Source surface, profile and wind ownership remain.
Typical queries prune distant edges; overlapping bounds and many parity crossings
can still have linear worst-case cost. Report tested distributions, memory and
GPU time, without a logarithmic guarantee or engineering optical accuracy claim.
