# V3 Scene membership review

- Type: review; status: approved; 2026-10-29.
- Target: [V3](../plans/2026-10-29-v3-scene-membership.md); ADR-0198.
- Owner/reviewer: current engine task, architecture/code self-review.
- Upstream files: none; SGP-0072 unchanged. No SDK/distribution edits.

## Findings and evidence

- P1, execution, fixed: direct contains rejected native sources in SDK-style
  collections. Public collection traversal now accepts arbitrary nesting and
  checks current reachability before snapshot work. A visited set handles shared
  collection references without repeated traversal. No source attachment or
  ownership is changed; non-native objects are rejected.
- P1, execution, fixed: removing an ancestor must invalidate a pending snapshot.
  Tests cover leaf removal, ancestor removal and ancestor destruction, plus
  cross-Scene and unmounted sources. The independent Worker can still finish
  after snapshot source release, as qualified in V2.
- P2, test fixture, fixed: a new cleanup destroyed an ancestor still owned by
  Scene, causing double destruction in afterEach. Cleanup now respects collection
  ownership; no runtime workaround was introduced.

All 19 adapter Specs pass with WebGL validation, including real native regional
loading in Globe/Planar nested collections and the existing camera/LOD, static
transform, decoder, budget, cancellation and ownership regressions. Full build,
generated types and tsc pass. The deterministic Voxel example now mounts its
source in a native child collection. SDK documentation explicitly allows passing
layer.nativeLayer and retains the same World/region/source-precision contract.

No blocking findings. Membership traversal is linear in reachable collection
members per pending update and stops after snapshot handoff; it adds no persistent
rendering work after completion. Existing source-content and grid-fill limitations
remain. Close this phase and create its independent local checkpoint before wind
particle-history implementation.
