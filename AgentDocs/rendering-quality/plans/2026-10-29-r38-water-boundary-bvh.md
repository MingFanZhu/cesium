# R38: Indexed underwater shore queries

- Type: phase; status: completed; owner visual gate pending; 2026-10-29.
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md).
- Owner/reviewer: current task, architecture/code self-review; architecture review confirmed.
- Entry: `066143a580`; ADR-0204; no upstream files or SGP changes planned.

## Source facts and decision

UnderwaterVolume scans all shore edges for parity and nearest intersection in each
pixel. Underwater prepares one flat RGBA32F row and enforces 256 total edges. The
separate original-profile BVH already handles variable water levels. Graph search
omits these newer helpers; direct source and existing GPU harnesses establish the
CPU/update/shader, lifecycle and generated shader boundaries.

Build a static median-split 2D shore BVH with up to four original edges per leaf.
Stackless escape indices and a packed single RGBA32F texture hold bounds/metadata
and contiguous leaf edges. Combine positive-X parity and current nearest ray
candidate tests in one traversal. Reuse the rational chart-box inequalities for
curved rays, and preserve exact leaf edge tests. Expand only bounds for FP32
roundoff, never geometry. CPU immersion uses the same index and original doubles.

Replace the 256-edge ceiling with immutable maximumUnderwaterBoundaryBytes,
default 8 MiB, allowed positive safe integer up to 64 MiB, including texture
padding. Report allocated underwaterBoundaryByteLength; fail over budget without
simplifying input or truncating traversal. Context size limits remain explicit.
The independent 1024 prepared-profile triangle ceiling remains. No screen-derived
membership, depth grid, SDK change, new full-screen target or per-frame readback.

## Validation and gate

- Independent CPU parity/brute rays vs GPU indexed queries: concavity, many edges,
  multiple/nested islands, local and curved rational paths, tangent/axis/near-edge
  rays, independent orthographic origins and cap/profile intersections.
- Above-256 sources, budget failure, lazy allocation, texture reuse and destruction.
- Existing local/Globe/profile/river optics regressions and reproducible large
  shoreline pictures. Bounded GPU timing against linear reference at fixed sizes,
  plus index build cost/bytes; do not claim worst-case logarithmic performance.
- Full build/release/types, scoped code/docs checks, ownership audit, review and
  separate local checkpoint. Earlier owner visual findings remain traceable.

## Completion

[Review](../reviews/2026-10-29-r38-water-boundary-bvh.md) approves the technical gate:
94 related release GPU cases, two large-boundary browser cases, full build/types
and direct linear-vs-indexed GPU timing. No SDK/upstream changes or next phase.
