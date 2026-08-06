# Review: P7 Manual Acceptance Corrections

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-06`
- Updated: `2026-08-06`
- Review target: complete working-tree diff after
  `b25691eba82317df870af20c948cd40bc8d92cf3`
- Related plan:
  [P7 manual acceptance phase plan](../plans/2026-08-06-phase-7-manual-acceptance.md)
- Related ADR:
  [ADR-0004](../../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md)
- SGP: none for P7

## Review target and scope

- `SceneGISPlanarCameraController` wheel normalization, boundary synchronization and narrow pitch
  round-trip handling.
- Controller direct/integration Specs, including the real DOM `WheelEvent` through Cesium's
  `ScreenSpaceEventHandler` and `CameraEventAggregator`.
- Explicit application-selected Earth skybox in the two existing EPSG:3857 Sandcastle examples.
- ADR-0004 amendment, phase evidence, ownership and generated-file audit.
- Terrain, underground navigation, touch/inertia, public tuning APIs, P3/P5 runtime and P8 are outside
  this review.

## Implementation summary

- Wheel zoom now computes `diff = end.y - start.y`, clamps `diff / clientHeight` to `[-0.1, 0.1]`
  and applies `exp(-5 * ratio)`. Browser-forward wheel therefore zooms in after Cesium normalization;
  small deltas remain continuous and a huge delta is capped.
- `_syncRig` obtains the actual four-frustum viewport-center ray and intersects the unbounded `Z=0`
  plane. A finite hit outside the extent is corrected to the inclusive boundary without home reset;
  the public world window pick remains bounded.
- Pitch decomposition accepts only `CesiumMath.EPSILON10` round-trip drift, then stores the exact
  clamped boundary. Valid `-5°` wheel/pan/release/new gestures remain stable; out-of-tolerance,
  valid parallel/below-plane and non-zero-roll poses use home recovery, while non-finite/degenerate
  Camera axes retain the P4 `DeveloperError` fail-fast contract.
- Both Sandcastle examples explicitly pass `SkyBox.createEarthSkyBox()` and describe this as an
  application environment choice, without adding atmosphere or changing non-Globe defaults.

## Source-to-spec mapping

| Source responsibility               | Spec                                    | Direct cases |
| ----------------------------------- | --------------------------------------- | ------------ |
| `SceneGISPlanarCameraController.js` | `SceneGISPlanarCameraControllerSpec.js` | 30           |

The direct suite contains `30` unique cases. Five P7 cases directly cover real DOM wheel direction,
normalized/capped scale, outside-center no-home correction, pitch-boundary continuity and
out-of-tolerance recovery.

## Validation evidence

- Focused fix rerun: controller `30 SUCCESS`, private-camera aggregate `38 SUCCESS`, World
  `14 SUCCESS`, navigation Widget `4 SUCCESS`, `npm run build` and `npm run build-docs` Exit 0.
- Architecture independently reran controller `30 SUCCESS`, private-camera aggregate `38 SUCCESS`,
  World `14 SUCCESS`, navigation Widget `4 SUCCESS` and `npm run build`, all Exit 0.
- Earlier accepted evidence remains: P1 world Widget `16 SUCCESS`; planar-world Widget `1 SUCCESS`.
- WebGL SceneGIS planar aggregate: `120 SUCCESS`, retaining surface/depth/mathematical-pick/imagery
  evidence. Imagery Widget: `9 SUCCESS`.
- P6 Home aggregate: `7 SUCCESS` with the ViewModel overlap; direct ViewModel: `4 SUCCESS`; planar
  Viewer: `18 SUCCESS`.
- Upstream input/widget regressions: ScreenSpaceEventHandler `148`, CameraEventAggregator `16`,
  ScreenSpaceCameraController `73`, CesiumWidget `75` and Viewer aggregate `82`, all SUCCESS.
- `npm run build`, `build-release`, `build-ts`, `build-docs` and `tsc`: Exit 0.
- Standard embedding gallery: Exit 1 because Hugging Face tokenizer metadata could not be fetched.
  Repository-supported no-embedding gallery passed with `305` examples; no-embedding Sandcastle
  build passed with plugin-timing and chunk-size warnings only.
- Final scoped ESLint, JavaScript/Sandcastle/Markdown Prettier, Markdownlint and
  `git diff --check`: Exit 0; Git emitted only existing LF/CRLF working-tree warnings.

## Ownership audit

- Relative base: `b25691eba82317df870af20c948cd40bc8d92cf3` on `feature/planar-world`.
- Upstream-owned product files changed by P7: `0`; P7 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001/0002 hunks and their upstream product files are
  unchanged.
- New SceneGIS-owned `SCENEGIS_PATCH` marker hits: `0`.
- Generated/Build/SpecList paths in status: `0`.
- Implementation is uncommitted and unpushed; P8 has not started.

## Findings

- `P7-R001` — medium, fixed, reviewer-confirmed: wheel Spec starts in range and proves direction/scale.
- `P7-R002` — medium, fixed, reviewer-confirmed: gesture correction proves Camera/center results.
- `P7-R003` — medium, fixed, reviewer-confirmed: pitch tolerance has paired rejection evidence.
- `P7-R004` — medium, fixed, reviewer-confirmed: ADR and phase evidence match P4 fail-fast behavior.

### P7-R001

Location: `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js:959`

The `zooms deterministically without changing perspective frustum fields` case still injects wheel
movement `-120`, which is now zoom-out, while asserting that range decreases. It passes only because
the un-homed initial Camera is already beyond the dynamic home maximum and the maximum clamp moves it
inward. This is a false-positive on the exact wheel-direction contract P7 is repairing.

Required disposition: put the Camera at a known in-range state, inject the correct positive normalized
zoom-in movement, and assert both the expected range change and unchanged perspective fields. The case
must fail if wheel direction is reversed and must not depend on an unrelated home-maximum clamp.

Execution disposition: `fixed`. The fixture now calls `viewHome`, runs `firstUpdate`, injects positive
`120` movement with a center pointer, and asserts the resulting center range is exactly the prior
in-range value multiplied by `exp(-0.5)`. The perspective FOV/aspect/near/far fields remain identical;
reversing the sign would increase or maximum-clamp the range and fail the exact assertion.

Architecture confirmation: `fixed`. The initial range is produced by `viewHome`, the direct normalized
movement has the approved positive sign, and the exact multiplicative assertion is independent of the
maximum clamp. The independently rerun controller suite passes `30/30`.

### P7-R002

Location: `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js:868`

The outside-center fixture calls private `_syncRig` and checks only `_target` plus the absence of
`viewHome`. An implementation that merely overwrites `_target` without translating Camera would pass,
while the actual center ray would remain outside and the next gesture could repeat the correction. The
project-owner finding occurred through normal input/update, not a direct private call.

Required disposition: add normal gesture/update evidence and assert that the post-correction unbounded
viewport-center hit equals the clamped target, the bounded public center pick is defined/equal, and the
Camera pose is finite. Retain edge/corner coverage; include both perspective and orthographic projection
families or justify equivalent coverage.

Execution disposition: `fixed`. The fixture now drives wheel movement through `controller.update` for
all four edges and four corners under real `PerspectiveFrustum` and `OrthographicFrustum`. It proves
the Camera moved, world pose vectors are finite, the private unbounded center hit equals the inclusive
clamped target, and the public bounded center pick is defined and equal; `viewHome` remains uncalled.

Architecture confirmation: `fixed`. The assertions observe the translated Camera and both unbounded
controller and bounded public-pick results after the normal update path. Perspective and orthographic
families cover every extent edge and corner without a home reset.

### P7-R003

Location: `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js:903`

The pitch fixture proves that `MAXIMUM_PITCH + EPSILON12` is accepted inside the new `EPSILON10`
tolerance, but there is no paired rejection fixture. The plan explicitly requires proof that the
tolerance is narrow and does not accept a genuinely out-of-contract near-horizontal pose.

Required disposition: add a pose beyond the tolerance by a numerically stable margin, process a real
controller gesture/update, and prove the existing surface-side home recovery still occurs. Keep the
accepted-side continuity fixture.

Execution disposition: `fixed`. A paired fixture constructs `MAXIMUM_PITCH + EPSILON8`, safely beyond
the `EPSILON10` tolerance, injects a wheel gesture through `update`, and proves exactly one `viewHome`
call plus the nadir home pose. The accepted `EPSILON12` continuity fixture remains unchanged.

Architecture confirmation: `fixed`. The accepted and rejected fixtures straddle the tolerance by
stable margins and both traverse controller updates; the rejected side proves exactly one recovery to
the nadir home profile.

### P7-R004

Location: `Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md:259` and the P7
plan validation/results wording.

ADR-0004 says a non-finite Camera pose still uses home recovery. The unchanged private
`getWindowRay`/`getHeadingPitch` contract validates Camera axes first and throws `DeveloperError` for
non-finite or degenerate axes, as the approved P4 plan already records. P7 did not add a catch or a new
recovery contract, so the durable documentation currently claims behavior the implementation does not
provide.

Required disposition: preserve the existing fail-fast helper contract unless Architecture explicitly
reopens it. Correct ADR-0004 and P7 evidence so out-of-pitch-tolerance, valid parallel/below-plane and
non-zero-roll poses are distinguished from non-finite/degenerate Camera axes that throw
`DeveloperError`; align any affected validation wording.

Execution disposition: `fixed`. ADR-0004 and the P7 validation/results now distinguish home recovery
for out-of-tolerance pitch, valid parallel/below-plane and non-zero roll from `DeveloperError` for
non-finite or degenerate Camera axes. No catch, helper, or product behavior was added.

Architecture confirmation: `fixed`. ADR-0004 and the phase evidence now preserve the P4 helper's
fail-fast boundary and distinguish it from the valid-axis states handled by controller home recovery.

## Accepted risks

- The project-owner browser/GPU gate accepted real wheel speed, boundary/pitch continuity, visible
  attribution and skybox appearance. OSM remains a best-effort public network dependency.
- Standard embedding depends on unavailable external Hugging Face metadata; the deterministic
  no-embedding path passed.
- The controller remains surface-side only. This is not a permanent negative-Z restriction on the
  world, rendering, imagery or picking contracts.

## Project-owner manual acceptance

On `2026-08-06`, the project owner confirmed all five manual gate items as passed: wheel direction and
speed, near-maximum-pitch continuity, four-edge/four-corner no-home behavior, explicit Home recovery,
and the two EPSG:3857 examples' skybox/attribution/console result. No new finding was reported. Terrain
and underground navigation remain explicitly deferred.

## Requested review

The focused re-review covered P7-R001 through P7-R004: the in-range exact wheel-scale fixture,
gesture-driven dual-projection boundary proof, paired pitch-tolerance rejection and corrected
fail-fast documentation. P7 remained active after code approval until the project owner completed the
manual acceptance gate; that gate is now accepted.

## Conclusion

Architecture confirms P7-R001 through P7-R004 as `fixed`; no code-review finding remains unresolved.
The implementation, automated evidence and project-owner browser/GPU gate are `approved`. P7 is
`completed` by its independent local Architecture checkpoint. The checkpoint is not pushed, and P8
has not started.
