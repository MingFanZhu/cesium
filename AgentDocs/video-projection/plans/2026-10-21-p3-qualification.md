# Phase P3: Dual-world examples and qualification

- Type: phase
- Status: completed; owner visual acceptance confirmed 2026-10-21
- Owner: current task architecture / execution
- Architecture review: confirmed
- Date: 2026-10-21
- Parent: [extension](2026-10-21-extension.md)
- Prerequisite: P2 committed
- ADR: ADR-0177; upstream changes planned: none

## Current facts and implementation

P2 has seven real-video GPU Specs, native type generation and full build evidence.
Existing Viewshed example already assembles local blocks, AGI 3D Tiles and S3M
fixtures in both Worlds. Reuse those data URLs and assembly conventions, expose
a dedicated `Test/视频投射.html` with caller-owned generated calibration video and
the existing bundled trailer. No network or new binary asset is required.

Add media playback, local file selection, opacity / flip / FOV / pose / resolution,
second projection, independent Viewshed and solar shadow controls. Page owns media
stream, timers and Blob URL cleanup, including BFCache-aware pagehide handling.
Capture errors visibly; do not hide missing data or use implicit fallback.

## Verification and exit gate

Dual-world E2E cover terrain / Model / 3D Tiles / S3M using the existing local
fixtures, moving main camera, independent resources, media pause and coexistence.
Use asymmetric calibration imagery to inspect direction, aspect and occlusion.
Record bounded single / dual projector 720p / 1080p upload counts / bytes and CPU
submission times at a fixed view, distinguishing them from GPU duration. No claim
of unlimited streams or static capture caching. Release-build focused smoke checks
generated shader delivery. Review fixes discovered in qualification receive targeted
regressions. Complete technical qualification and commit; owner visual gate stays open.

## Outcome

Eight GPU Specs, eleven development E2E, three release smoke E2E and release build
passed. Same-element stream replacement callback invalidation was fixed with a
regression. Bounded CPU / GPU / upload evidence and remaining limits are in the
[P3 review](../reviews/2026-10-21-p3.md). The owner confirmed visual acceptance on
2026-10-21. Phase checkpoint: 81e3609272.
