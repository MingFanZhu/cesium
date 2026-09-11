# Review: A14-G Globe Clock Linkage

## Metadata

- Type: `review`
- Status: `approved; direct linkage verified; owner gate passed`
- Author: Architecture Agent
- Created / updated: `2026-09-04` / `2026-09-11`
- Branch / base: `feature/atmosphere-clouds-effects` /
  `ccd5affdc426016215bb443664dc653bba945d94`
- Plan: [A14-G](../plans/2026-09-04-phase-a14g-globe-clock-linkage.md)
- Discussion: [source diagnosis](../discussions/2026-09-04-a14g-globe-clock-linkage.md)
- Owner gate: `passed; explicit owner acceptance on 2026-09-11`

## Confirmed review target

The reported disconnect is a missing sample-level link between native Clock
and caller-owned cloudTime. Architecture confirms the native tick/render order
and approves the fixed-epoch plus manual-offset design. A13 is independently
accepted and committed; no current shader, cloud shape, shadow projection,
sampling or history finding is reopened.

Review must verify paused seeks, multiplier/reverse without double scaling,
deterministic return to time, immediate preset/offset publication, unchanged
initial state, and listener removal before Viewer/controller teardown. GUI
bindings must display native playback state instead of inventing another clock.

At design time, implementation, focused E2E and live evidence were unavailable.
The results below supersede that pending code state without inferring owner acceptance.
Expected scope is two SceneGIS-owned executable paths and five records;
product/API/GPU resource/upstream/generated/new-SGP deltas are zero.

## Execution result — 2026-09-04

`globe.js` derives the fixed epoch from `groundHighSun.time` and publishes
absolute Clock seconds plus a zero-initialized page offset. One shared function
runs after each of the three preset time assignments, offset edits and every
native onTick without enabled/visibility/pause/readiness filters. One listener
is registered after initial observation setup and removed before teardown;
initialization failure also invokes idempotent cleanup. BFCache policy remains
in the unchanged common helper. No extra tick, render loop or time authority.

The real GUI now exposes the offset, read-only cloud simulation time and direct
Clock playback/multiplier bindings. Native pause updates are reflected through
the existing GUI listening pattern. Initial paused cloudTime remains zero.

The one added E2E passes against the real ESM sample. With its own default loop
stopped and native TICK_DEPENDENT Clock, public values are
`0, 0, 2, 5, 1, 1, 1, -120, 5` for initial/pause/forward/speed/reverse/pause/
canAnimate-false/paused-before-epoch seek/deterministic return. GUI offset 37
publishes 42 immediately; GUI speed 4 and playback yield 46, then disabled/clouds
hidden 50 and re-enabled 54 without listener growth. All three preset families
publish immediately and preserve the offset. After two idempotent destroy calls,
a retained Clock tick leaves released effects unchanged; page/controller errors
are empty. The previous delivery test is unchanged and was not rerun.

Validation uses the existing server, not the upstream webServer launcher:

```sh
npx playwright test --config <temporary>/playwright.config.mjs --project chromium --workers 1 --retries 0 --grep "links Globe cloud motion to the Cesium simulation clock"
```

The disposable external config imports `Specs/e2e/playwright.config.js`, sets
absolute repository testDir and temporary output/report paths, overrides
`webServer: undefined`, workers 1 and retries 0, and retains localhost:8080.
Final result: **1 passed (34.7 s), exit 0**. An initial anchored grep selected
zero tests; the first actual run then timed out on a stale `.controller` CSS
locator after the Clock sequence passed. The recorded accessibility snapshot
showed valid labeled controls. Replacing only that test locator with getByLabel
produced the final pass; no timeout increase or runtime workaround was added.

Focused ESLint and Prettier for `Test/AdvancedEnvironment/globe.js` and
`Specs/e2e/scenegis-globe-environment.spec.js` pass. Five-record scoped Prettier/
Markdownlint and `git diff --check` pass (retained line-ending warnings only).
No product GPU/controller/Planar/package/type/build or full E2E matrix ran.
Temporary config/artifacts are removed after validating their isolated root;
no runner or upstream config change is retained. The owner page/service was
not operated, stopped or restarted.

Changed scope is exactly the two executable paths and five authorized records.
Added listener ownership: one per page, zero after cleanup; re-enable does not
register another. Product/API/GPU resources/upstream/generated/new-SGP deltas
are zero; SGP-0008/0009 and accepted A13 behavior are frozen. Extreme dates still
use the existing +/-1e9-second validation; rapid clock changes can legitimately
trigger existing history cuts. No visual acceptance is inferred. Status:
`review_ready`, uncommitted/unpushed, awaiting independent Architecture review.

## Independent Architecture review — 2026-09-04

Result: **approved for owner gate**, no actionable code finding. Architecture
read the full two-file implementation diff and the existing initialization,
GUI, error tracking, cleanup and native Clock/render call sites. The branch
and exact base match the assignment; the retained delivery E2E is unchanged.

- The immutable epoch is derived from the existing initial preset. Absolute
  JulianDate subtraction plus page offset preserves equal-time determinism;
  no accumulated delta, wall clock or second multiplier is introduced.
- Native Clock commits currentTime and emits onTick before Scene.render.
  Paused ticks still publish, and native timeline scrubbing pauses after its
  currentTime assignment. All three sample preset functions synchronize
  immediately. Re-enable and visibility changes do not register listeners.
- The offset and read-only result replace the conflicting manual cloudTime
  control. Playback/multiplier bind to the native Clock and listen to its
  state. Existing equality-aware warm publication remains authoritative.
- The page removes its listener before any controller/Viewer teardown, and
  the initialization catch reuses idempotent cleanup. The effects guard covers
  partial setup before controller creation; the common BFCache policy is
  unchanged. The retained-Clock E2E detects callback activity after disposal.

The existing focused Chromium **1/1 pass, 34.7 s** and scoped executable
ESLint/Prettier results are sufficient and were not rerun. This is a review of
that evidence, not a claimed independent duplicate execution. Product/API,
GPU resource and build/type paths are unchanged, so no engine/full matrix
or installed-package test is added.

### Direct owner-page observation

The existing browser tab was on localhost:8081, whereas the isolated Execution
E2E used localhost:8080. Architecture preserved its actual camera and public
parameters, reloaded that same tab once to load the corrected sample module,
and restored the camera before observation. The live view is high/mixed,
coverage 0.3, density 1, Natural Earth II/WGS84 ellipsoid, initial
2026-06-21 10:30 UTC, with normal render loop and input enabled. No quality,
wind, material, shadow or lighting parameter was changed for this check.

Using the actual GUI, multiplier 10 and playback advanced cloudTime from 0 to
`76.12799999999697` seconds. The fixed-camera images show both cloud bodies
and ground-shadow features displaced; the Sun remains high. The native pause
control then holds both Clock time and cloudTime at that value across subsequent
normal frames. This verifies physical cloud motion, not just a ticking label.

A single native mouse drag on the Cesium timeline selects
`2026-06-21T12:14:41.63265306122775655Z`. While still paused, public cloudTime
is `6281.632653061228`, exactly equal to the JulianDate difference from the
fixed epoch. The playback checkbox remains off. No application error or extra
time integration is observed. No manual tick, GPU probe/readback, replay or
convergence loop is used on the owner page.

Cleanup restores the original 10:30 UTC instant, cloudTime 0, multiplier 1
and paused state. Public effect differences are empty; camera position delta
is zero and direction/up differences are floating-point roundoff only
(below 9e-15). The same 1570x1150 drawing buffer, native picker/timeline,
normal render loop, input and ready/HDR state remain. Browser warnings/errors
and sample errors are empty. No temporary callback, program or page diagnostic
was installed; the corrected page remains available for owner interaction.

### Audit, limits and next action

Independent base-path audit finds exactly the two authorized executable paths
plus five records, all SceneGIS-owned. Upstream-owned changed **0**, generated
changed **0**, new SGP **0**; SGP-0008/0009 stay frozen. Product/Planar/common
sample and manifest diffs are empty. GPU/resources, sampling and history-policy
deltas are zero; the index is empty and no commit/push occurred.

After Architecture writeback, scoped five-record Prettier and Markdownlint
checks pass. `git diff --check` passes with retained LF/CRLF warnings only.

Very large dates retain the existing +/-1e9-second validation. Fast-forward
and large seeks may cross the accepted temporal cut thresholds; this review
does not promise smooth temporal accumulation at arbitrary playback speeds or
reopen the accepted A13 grain/performance limits. The owner must explicitly
accept the new linkage before the A14 checkpoint. Execution holds without
further changes, tests or browser operations; no next phase is authorized.

## Project-owner acceptance — 2026-09-11

The owner explicitly accepts A14. Architecture confirms the phase gate is
passed: code approval has no actionable finding, the focused Chromium E2E
passed 1/1 in 34.7 s, and the prior live observation covers visible cloud and
ground-shadow motion, pause and native timeline scrubbing. These existing
results are reused; no new E2E, browser or GPU run is claimed at closure.
Earlier pending-owner and execution-hold statements are historical and
superseded by this acceptance.

The exact candidate remains two SceneGIS-owned executable paths and five
records. Closure only updates these records. The commit containing this
acceptance is the isolated local A14 checkpoint, with no push. Upstream-owned
changed files: none; generated changed files: none; new SGP: none.
SGP-0008/0009 and the product/API/GPU resource boundary remain unchanged.

There is no unresolved A14 finding or manual gate. Existing +/-1e9-second
validation and history cuts on fast-forward or large seeks remain accepted
limits; this acceptance adds no motion-quality or performance guarantee.
The extension has no active successor, and P1/later Planar effects remain
deferred.

Closure validation: `npx markdownlint "AgentDocs/**/*.md"` passes. The required
`npx prettier --check --ignore-path .gitignore "AgentDocs/**/*.md"` reports
16 existing formatting failures, all outside the seven-path candidate (including
two template README files and older phase records). Those files are unchanged;
this unrelated formatting debt is not an A14 finding. The candidate itself
has no reported formatting failure in that scan. `git diff --check` passes,
and the repeated upstream-base path audit confirms zero upstream-owned paths.
The explicit seven-path Prettier check also passes.
