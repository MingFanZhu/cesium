# R26 review: Directed river surfaces

- Type: technical review; date: 2026-10-21
- Target: feature/river-water, R26 implementation and qualification
- Reviewer/implementation owner: current task, source-based architecture self-review
- Parent: [R26 phase plan](../plans/2026-10-21-r26-river-surface.md)
- ADR: ADR-0180; existing SGP-0017 reused unchanged
- Disposition: technical checks pass; owner visual acceptance pending

## Scope and integration

SceneGISRiverSurface binds an exact live World. Ordered ECEF/ellipsoid heights or direct
Planar XYZ, widths and speeds define a simple mitered corridor. Optional shore masks and
holes clip that corridor. Source triangles carry height, station, transverse position and
speed; LOD clipping interpolates all components, including inserted shared-edge vertices.
The existing regional water mesh, caches, optics, lighting and Scene captures are reused.
Picking reports RiverSurface. FFT is optional and caller-owned, independent from current.

The only preparation seam is private options on the SceneGIS-owned WaterSurface composer.
Default local and existing ellipsoid WaterSurface contracts remain unchanged. River
mean-surface normals and local optical tests account for authored slope; Planar has no
planet curvature term. After owner feedback, current waves affect geometry and normals
through one bounded height field; they do not represent a hydraulic state.
No new framebuffer, flow texture, full-screen pass, Worker, external asset or global registry.

All changed files are SceneGIS-owned. **Upstream-owned files changed: none.** SGP-0017
is reused without modification. Patch audit passes with zero current upstream entries
and no generated status. Public declarations contain the new constructor, readonly World,
statistics and borrowed wind, numeric current controls and getBoundingSphere; private
chart/domain classes do not leak into generated declarations.

## Initial checkpoint verification

- Eight feature Specs pass in development and release with WebGL validation: input and
  topology validation; concavity/hole clipping without mask-height contamination;
  continuous mixed-LOD height/station/speed; regional date-line ellipsoid heights;
  both-world pixels, animation, picks, visibility and resource release; independent
  optional FFT; exact World rejection before allocation. The final release run also
  checks seek-back reproducibility and pixel continuity across the 8-second phase wrap.
- Existing strict GPU regressions pass: 17 WaterSurface, 7 EllipsoidWater and 5 WindWaves.
- Two browser E2E cases pass, one per World: near/overview/low/high views, 19 continuous
  distance/pitch samples, bounded selection/cache, warm geometry reuse, independent
  wind controls, public pick ownership, bounds and complete teardown.
- Implementation inspection of both-world near/overview/low/high captures and optional
  FFT finds continuous coverage in these views. Synthetic riverbanks are deliberately
  simple. This does not replace owner judgment of visual current/wave quality.
- BuildRelease, buildTs and tsc pass; changed-source ESLint and scoped formatting pass.
  Existing upstream JSDoc warnings remain; no new RiverSurface declaration warnings.
- Full AgentDocs markdownlint passes. The required full AgentDocs Prettier check reports
  562 unchanged files with formatting issues; all modified documents pass scoped formatting.
  Unrelated existing formatting warnings are left intact.

## Initial checkpoint construction and runtime evidence

Windows, RTX 3060 Ti / ANGLE D3D11, Playwright Chromium 151.0.7922.34, 1185×800,
HDR with MSAA 1 / FXAA, physical sky and water SSR; no height fog/clouds. The deterministic
river is about 5 km, 17 cross-sections, varying width and speed, one hole, a synthetic bed,
1 m finest spacing and 256-leaf budget. Karma uses installed Chrome Headless 155.

| World / view     | Tiles | Triangles | Cold full-frame CPU | Warm CPU median |
| ---------------- | ----: | --------: | ------------------: | --------------: |
| Planar near      |   165 |     80342 |            115.8 ms |          5.0 ms |
| Globe near       |   172 |     82929 |            128.7 ms |          7.6 ms |
| Planar low angle |    26 |      7432 |             17.6 ms |          1.5 ms |
| Globe low angle  |    25 |      7214 |             20.0 ms |          3.3 ms |
| Planar high      |     1 |       198 |              1.8 ms |          1.1 ms |
| Globe high       |     1 |       196 |              7.7 ms |          2.8 ms |

These are frozen-time full-scene CPU measurements with the automatic loop stopped,
one explicit first frame and eight subsequent frames. Constructors took 2.5 / 4.1 ms;
they do not allocate the detailed GPU meshes. Warm geometryBuilds stayed zero. The
camera tour retained about 4.3–4.4 MiB mesh storage, within the 16 MiB inactive limit.

A bounded near-view GPU sample advances time by 1/60 second and uses eight valid timer
queries per condition. Full-frame medians (current-only / current+128² FFT / hidden)
are Planar 15.72 / 11.45 / 3.22 ms, Globe 15.70 / 15.99 / 6.47 ms. They include scene
rendering, changed water coverage and screen-space ray traversal; differences are not
isolated FFT cost or a sustained frame-rate guarantee. Product code does no GPU readback.

## Findings and disposition

1. **P2, fixed — phase-wrap filtering:** a common maximum footprint for both advection
   phases could let the invisible phase change filtering abruptly at wrap under a speed
   gradient. Filter each phase before blending. Release pixel checks cover the wrap,
   clock seek-back and zero-speed stability in both Worlds.
2. **P2, fixed — construction pair scan:** all-pair corridor intersection checks took
   264 ms for a deterministic 512-control-point, nonintersecting river. Sweep sorted edge
   bounds before exact intersections; equivalent construction takes about 2.6 ms,
   1024 controls about 2.8 ms on this machine. Invalid/folded/crossing cases still reject.
   Dense overlapping bounds can still have quadratic work; no general linear-time claim.
3. **P2, open limitation — synchronous cold mesh build:** detailed first visits still
   cost roughly 116–129 ms in the example. This is inherited from R25. Owner judges
   acceptability; reopening requires an explicitly designed bounded build scheduler or
   Worker path, not hidden fallback water or settling frames. Owner/next step: project
   owner visual gate in the linked phase plan; execution role follows concrete feedback.
4. **P2, fixed — broad white current streaks:** at the owner's reported near-water Globe
   view, disabling currentFoamIntensity removes the broad stripes. They were artistic
   foam, not wave geometry or obligatory lighting. Default intensity is now zero and
   the example labels this opt-in control explicitly. Contact and optional FFT foam
   retain their own semantics. Owner visual acceptance of the replacement is pending.
5. **P2, fixed — current waves had no displacement:** vertex and fragment stages now
   share four non-harmonic, modulated river-coordinate bands. Smooth staggered phases
   wrap every 32 seconds, retain authored downstream advection and bound distortion.
   Height weights sum to at most one. Public, selection and command bounds include
   currentRippleAmplitude; near-bank fade and continuous LOD/pixel filtering remain.
   The GPU test reads the actual production vertex output: a 2 m/s profile shifts
   2 m downstream in one second; zero speed freezes, zero amplitude and shoreline fade
   remove displacement, and unresolved distant waves converge to the mean surface.

## Visual correction verification and cost

Nine RiverSurface Specs pass in development and release with strict WebGL validation,
including actual vertex motion, runtime bounds in both Worlds, clock seek-back and
32-second wrap continuity. Both-world browser E2E passes near/low/high views, the
19-sample camera sweep, picking, optional FFT and teardown. In-app inspection restores
the owner's original Globe camera after reloading the new implementation. Release,
generated declarations and TypeScript checks pass; existing upstream JSDoc warnings
remain. No upstream-owned file or SGP changed.
The 29 shared-water regressions pass again in release with WebGL validation (17 local
WaterSurface, 7 ellipsoid water, 5 FFT). Changed-source lint, patch audit and full
AgentDocs markdownlint pass. Full AgentDocs formatting still reports the same 562
unchanged files; all files touched by this correction pass scoped formatting.

The revised example uses 0.3 m maximum amplitude, 14 m dominant wavelength and no
artistic foam; engine defaults are 0.12 m / 12 m / zero foam. Actual multiband heights
are below the configured upper bound. Defaults apply only to RiverSurface.

At the owner's original near-water Globe camera, RTX 3060 Ti / ANGLE D3D11, 1001×826,
physical sky, SSR, no FFT: alternate zero amplitude / 0.3 m amplitude for 20 frames,
discard the first four and retain eight valid GPU samples per condition. Full-frame
GPU medians are 5.88 / 6.64 ms; CPU medians 1.95 / 2.20 ms. The moving-wave condition
selects 19 tiles, 7759 triangles, about 3.04 MiB cached meshes, zero geometry builds.
Both conditions execute the same shader; the difference includes coverage and SSR ray
changes, not an isolated instruction-cost measurement. No new texture/pass or per-frame
mesh update is introduced. Original cold-build limitations remain open; E2E starts
in the detailed near view now, so subsequent near-view timings are cache hits, not
evidence that first-build cost was fixed. Current-only near-view warm CPU medians are
4.6 ms Planar / 8.9 ms Globe in the browser run; background build activity makes those
values indicative only. The isolated in-app alternating sample above is the runtime
comparison used for this correction.

## Remaining gate

Owner visual acceptance and cold-build tolerance remain pending. R25 and older open
findings remain in their own reviews. Visual flow is not mass/energy conservation;
profile edits replace the primitive, speed changes reevaluate the current phase, and
Globe chart distortion/above-water/screen-space limitations remain documented.
No confluences, branching, waterfalls, hydrodynamics or ocean work is activated.
