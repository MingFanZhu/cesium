# Phase Plan: A14-G Globe Clock Linkage

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture approved; owner gate passed`
- Created / updated: `2026-09-04` / `2026-09-11`
- Diagnosis / design / reviewer: Architecture Agent
- Implementation: Execution Agent
- Branch: `feature/atmosphere-clouds-effects`
- Exact base / frozen A13 checkpoint: `ccd5affdc426016215bb443664dc653bba945d94`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Discussion: [source diagnosis](../discussions/2026-09-04-a14g-globe-clock-linkage.md)
- Review: [A14-G review](../reviews/2026-09-04-a14g-globe-clock-linkage.md)
- Governing contracts: ADR-0046 caller-owned cloud time; ADR-0048 render-frame sampling
- Upstream / generated / new SGP: `0; SGP-0008/0009 frozen`

## Goal and confirmed root cause

The owner accepted A13, then reported that clouds do not follow Cesium time.
The sample initializes `cloudTime` to zero and only its manual GUI setter
changes it. Celestial lighting consumes Scene simulation time, but cloud body
and Beer shadows share a displacement derived from caller-owned `cloudTime`.
The renderer is correctly honoring ADR-0046; the missing link is sample API
assembly, not a second product animation system.

`CesiumWidget.render` calls `clock.tick()` before `scene.render(currentTime)`;
`Clock.tick` raises `onTick` even when paused. Native timeline scrubbing sets
`currentTime` and pauses the clock. A page-owned `onTick` callback therefore
publishes time before controller preparation, cloud tracing and shadow work.

## Approved behavior

1. Use one immutable sample epoch equal to the existing initial high-Sun
   observation instant, `2026-06-21T10:30:00Z`. Derive it from the existing
   observation definition rather than duplicating a time literal. Compute
   `cloudTime = JulianDate.secondsDifference(clock.currentTime, epoch) + offset`.
   The offset starts at zero, preserving the initial accepted cloud placement.
   Do not integrate delta time, use wall time or multiply by `clock.multiplier`
   again. The Clock already accounts for speed, reverse and range behavior.
2. Register exactly one page-owned `clock.onTick` listener. Publish on every
   tick regardless of `shouldAnimate`, `canAnimate`, ready, enabled or cloud
   visibility. Existing setter equality/request-render behavior handles
   unchanged values; do not request extra renders unconditionally.
3. Initialize after the existing initial preset has set the clock. Reuse the
   same small synchronization function after preset time changes and manual
   offset edits so public time is immediately coherent, without an extra tick
   or frame. Do not reset the epoch/offset on presets, pause, toggle or seek.
   Keep the native initial paused state and existing preset camera/lighting.
4. Replace the conflicting manual `Cloud time` control with an editable
   `云时间偏移（秒）`, retaining its -3600..3600, step 1 range, plus a read-only
   `云仿真时间（秒）` display for the resulting public value. Add a compact
   lil-gui `时间` folder with `播放` bound directly to Clock.shouldAnimate and
   `时间倍速` bound directly to Clock.multiplier (-120..120, step 1).
   Use existing GUI listening/update patterns so native scrubs and presets
   show their paused state. Preserve BaseLayerPicker, timeline, animation
   widget configuration and all unrelated UI/values.
5. Keep wind speed/direction, material, Sun/Moon, cloud quality and temporal
   policy unchanged. Cloud and shadow consumers retain their shared offset.
   STBN and medium phase selection stay keyed to native rendered frame number,
   not simulation seconds. Large time jumps retain existing history rejection;
   do not add settling, interpolation or a custom time clamp/wrap/fallback.
   The existing finite +/-1e9-second product validation remains authoritative.
6. Remove the owned Clock listener before controller/Viewer destruction,
   including partial initialization cleanup. Preserve idempotence and the
   existing BFCache policy. Disabled effects still track the same absolute
   sample time; re-enable must not start another listener or restart animation.

## Allowed paths and implementation boundary

- `Test/AdvancedEnvironment/globe.js`: the synchronization function, epoch,
  offset/display/playback GUI, preset call sites and cleanup described above.
- `Specs/e2e/scenegis-globe-environment.spec.js`: one focused clock-linkage
  test using the real ESM sample; retain the previous delivery test unchanged.
- This phase plan, its discussion/review, extension roadmap and README:
  execution result, deviations and current handoff only.

Product JS/GLSL/Specs, Planar/common sample code, assets, shader generators,
package/build config, upstream files and SGP manifests are frozen. No new
public API, reusable time controller, dependency, resource, permanent render
loop, timer or broad refactor. This applies the existing ADR-0046 contract;
no new ADR is required for page-owned assembly. Report any required expansion
to Architecture before implementing it.

## Minimum automated validation

Add one test named `links Globe cloud motion to the Cesium simulation clock`.
Use the existing E2E fixtures/local ESM page and no external datasets. After
ready, stop the test page's default loop while deterministically advancing
its native Clock with `ClockStep.TICK_DEPENDENT`. Exercise forward ticks,
changed positive multiplier, negative multiplier, paused ticks, a paused
absolute seek before the epoch, and return to an earlier timestamp. Assert
the exact public `cloudTime` differences and deterministic return, not pixels.
Exercise the actual offset/playback GUI and verify offset preservation. Keep
the initial cloud time zero and unchanged during ordinary paused ticks.
Destroy the sample, retain its Clock for one further tick, and verify no
sample callback changes the released effects or raises an error. Retain zero
page/controller errors. Do not add replay/convergence loops or GPU readbacks.

Run only that exact Chromium E2E test, retries zero, worker one. The standard
Playwright config starts a server with `reuseExistingServer: false`; do not
stop/restart the owner's live server. Use a disposable external config which
imports the repository config, fixes its testDir/output/report paths relative
to the repository and disables webServer, targeting the existing localhost
server. Create it with apply_patch, run the exact test, then remove only that
validated temporary file/directory. Do not edit the upstream config or retain
a second test runner. Record the exact command/config override and result.

Also run scoped ESLint and Prettier on the two executable paths, scoped
Prettier/Markdownlint on the five records, and `git diff --check`. No engine
GPU/controller/Planar/package/build/type/full E2E matrix: product and resource
code are unchanged. Existing delivery assertions need not be rerun.

## Independent review, owner gate and stop

Architecture reviews formula, tick ordering, pause/seek, GUI and cleanup,
then owns the live playback/paused-scrub observation on the preserved owner
page. Execution does not manipulate that page or infer owner acceptance.
Return `review_ready` with exact results, deviations, full changed paths and
zero product/resource/upstream/generated/new-SGP audit. Remain uncommitted and
unpushed; no checkpoint, next phase or Planar work. Root does not poll the
Execution task after dispatch; Execution proactively sends review readiness.

## Execution handoff

The page-owned absolute Clock link, offset/read-only display, direct playback
controls and listener cleanup are implemented in the two allowed executable
paths. The focused Chromium E2E passes (1/1, 34.7 s), including paused seeks,
reverse/speed, GUI offset preservation, disable/re-enable and retained-Clock
teardown. [Execution details](../reviews/2026-09-04-a14g-globe-clock-linkage.md#execution-result--2026-09-04)
record the temporary external-config override, corrected test locator and
scoped checks. No product/resource/upstream delta or owner-page operation.
Review-ready, not owner-approved; the tree remains uncommitted/unpushed.

## Independent review and owner handoff

Architecture approves the exact seven-path candidate with no code finding.
The existing E2E result is sufficient and is reused without another run.
On the current owner page, native 10x playback advances cloudTime from 0 to
76.128 seconds with visible cloud and ground-shadow displacement. Pausing
keeps that value unchanged. A real native timeline drag while paused selects
12:14:41.632653 UTC and publishes the corresponding 6281.632653 cloud seconds.
The prior high/mixed parameters, camera, initial time, 1x multiplier and pause
are restored; ready/HDR, input and normal render loop remain active, errors 0.
See [independent review](../reviews/2026-09-04-a14g-globe-clock-linkage.md#independent-architecture-review--2026-09-04).

The owner can use the existing time folder and native timeline for final
acceptance. Fast-forward/large seeks still use the accepted history-cut policy;
this phase does not certify additional motion quality or performance targets.
Execution holds with no further code, test, browser, commit or push action.
The A14 checkpoint remains blocked only on explicit owner acceptance; no
successor phase or Planar work is authorized.

## Project-owner acceptance — 2026-09-11

The owner explicitly accepts A14. Architecture closes the implementation,
automated and manual gates using the existing approved seven-path candidate,
focused Chromium E2E (1/1, 34.7 s) and direct playback/paused-timeline evidence.
No code finding remains. Earlier owner-pending and execution-hold instructions
above describe the pre-acceptance state and are superseded by this closure.

The commit containing this record is the isolated A14 local checkpoint,
including the two sample/E2E paths and five AgentDocs records. Product/API,
GPU resources, upstream-owned files, generated files and new SGP remain zero.
No additional browser/GPU test accompanies owner acceptance; the existing
large-date validation and fast-forward/seek history cuts remain in force.
The extension has no active successor; P1 and later Planar effects remain
deferred. No push accompanies this checkpoint.
