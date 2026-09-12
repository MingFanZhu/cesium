# P3 Planar HDR Review

## Metadata

- Type: `review`; status: `accepted`; created/updated: `2026-09-11`
- Reviewer: current Architecture role under owner visual delegation
- Plan: [P3](../plans/2026-09-11-phase-p3-planar-hdr-bloom-lens.md)
- Predecessor: P2 `b09a3d5ce2`; upstream delta budget: zero

## Targets

Verify the shared scene-linear HDR chain, Planar explicit Sun and depth gates,
native ownership, zero-work/warm/resize/release behavior and visual result.

## Findings and acceptance

- Medium, fixed: the inherited finite horizontal/vertical support formed a
  saturated rounded square around the real Planar Sun. The HDR-off comparison
  retained a circular solar disk, isolating the blur schedule. ADR-0049 now
  specifies six evenly distributed directions with the same covariance and
  six-pass/resource budget. The same fixed Sun view now shows a round soft
  footprint. Globe's accepted schedule and all GLSL remain unchanged.
- Test harness, fixed: the warm-setter assertion initially included earlier
  HDR execution, which legitimately updates inactive-cloud diagnostics. Its
  snapshot now isolates the setters whose continuity is under test.

Passed actual GPU checks: Globe and Planar HDR threshold, three paired blur
passes, finite-depth lens occultation, cloud-dimmed input, additive HDR and
exact alpha; the Planar fixture also passes after the six-direction correction.
Planar P3 lifecycle verifies lazy bypass, explicit above/below-plane Sun,
native-bloom rejection before pipeline creation, odd-sized resize, exact
216-byte test allocation, warm setters and disable, and final texture release.
Existing Planar integrated medium composition passes with its HDR switches
explicitly off. Full build/build-ts/tsc, changed lint/format and ownership audit
pass; build-ts retains the existing broad JSDoc warnings. Full AgentDocs
Prettier retains the previously recorded 16 unrelated failures; changed docs
and full AgentDocs markdownlint pass.

Actual page: ready/HDR, zero reported browser errors, round solar bloom and
separated ghost/halo in the fixed low-Sun comparison. Six GPU elapsed samples
for the complete eight-pass HDR chain at 1724 × 1150 range 0.187–0.206 ms,
median 0.199 ms. Allocated storage is 23,791,200 bytes, matching the formula.
This is a bounded stage measurement, not a total-frame/FPS claim.

Architecture accepts P3 under owner delegation and creates its independent
local checkpoint. No upstream-owned change or new SGP; consume SGP-0008 only.
Cloud morphology/brightness, rays and readable night/celestial remain explicit
successor work. The current agent owns those remaining roadmap items.
