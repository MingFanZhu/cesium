# G1 review：共享多视角

- Type: review
- Status: approved
- Date: 2026-11-02
- Owner: current task architecture self-review
- Target: [G1](../plans/2026-11-02-g1-gaussian-views.md)
- ADR: ADR-0208; upstream / SGP delta: none

Union visibility and maximum visible-camera SSE operate within the original single Active
Cut and budgets. Optional views are part of immutable proof validation, including all camera
inputs rather than identity text alone. Main-camera position remains the ordering origin;
projector resolution supplies its own pixel metric. Conservative footprint priority may
allocate more detail under a fixed budget, but does not expand that budget or imply equal
quality at every camera. No duplicate loader, atlas, sorting pass or per-frame GPU readback.

32 Node tests pass: original 30 Active Cut cases plus two multi-view cases cover validation,
offscreen union selection, maximum-detail projection, stale proof rejection and caps.
48 controller regression cases pass with ChromeHeadless WebGL validation. Source lint and
changed-path formatting pass. No unresolved G1 finding; G2 must exercise actual observer
registration, covered-state freshness and GPU capture before claiming projection support.
