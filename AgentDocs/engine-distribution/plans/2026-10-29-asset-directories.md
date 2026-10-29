# Static asset copy directory correction

- Type: standalone maintenance plan
- Status: completed
- Date: 2026-10-29
- Owner: Execution Agent; design/review: Architecture Agent (current task)
- Architecture review: approved
- Related extension: [engine-distribution](../README.md); completed D1/D2 scope unchanged
- ADR/SGP: ADR-0205 / SGP-0074

## Reproduced failure and cause

The generated SceneGIS artifact contains 53 empty source-shaped directories. Native
copyEngineAssets/copyWidgetsAssets exclude JS/TS/GLSL/CSS/Markdown files but pass directory
entries through copyFiles to gulp.dest. The graph has no copyFiles node; source inspection
confirms its callers only copy files/assets, including widget remapping and Source delivery.

## Minimal change and validation

Filter directory Vinyl entries in the shared native copyFiles stream, preserving its file globs,
base paths, bytes and implicit parent creation. Register the one upstream hunk as SGP-0074.
No post-build directory deletion, source whitelist or separate implementation is required.

First reproduce with a temporary engine/widgets asset fixture containing source-only and
truly empty directories plus real binary assets, notices, CSS and nested images. Then assert
the complete SceneGIS artifact has no empty directories. Rebuild the target; compare the
existing payload path/size inventory, run the copy fixture and distribution/docs tests,
and retain browser resource/lifecycle coverage. No runtime/public API change or new full
native release matrix is required. Review, update handoff and create a local maintenance commit.

## Completion

[Review approved](../reviews/2026-10-29-asset-directories.md). Full target, 8 Node tests,
7 browser cases and root build-script type check pass. Zero empty output directories;
all payload paths and resource/documentation sizes are retained. No new public API.
