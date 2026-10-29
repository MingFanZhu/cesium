# Asset directory correction review

- Type: standalone review
- Status: approved
- Date: 2026-10-29
- Owner: Architecture Agent (current task); execution: same task
- Target: [maintenance plan](../plans/2026-10-29-asset-directories.md)
- Upstream-owned file: scripts/build.js; SGP-0074; ADR-0205

## Finding and fix

The reported artifact contained 53 source-only directory nodes (including empty ancestors).
Gulp's source stream retained directory Vinyl objects after file exclusion globs. The initial
nodir option did not filter these objects in the installed Gulp chain; the failing fixture
exposed this immediately. The final fix is an explicit object-mode directory filter before
gulp.dest. It retains original globs, binary encoding, base paths, empty-match behavior and
implicit destination parents. No output cleanup or resource whitelist was added.

Previous D1/D2 checks verified files, declarations, docs and runtime loading but omitted empty
directories. Two dedicated regressions now cover source-only/empty input folders and the
complete generated artifact. Fixture byte comparisons also cover binary data, notices, CSS
widget remapping and nested widget images.

## Validation

- Before fix: both new regression tests failed on the reproduced directories.
- `npx gulp buildSceneGIS`: passed, including native type-generation checks.
- Asset-copy, declaration and documentation Node tests: 8 passed.
- Distribution Playwright: 7 passed, including root/nested IIFE/ESM, actual Worker/WASM/texture,
  both World lifecycles and standalone docs search/type links.
- `npx tsc --project tsconfig.json`, scoped ESLint/Prettier, Markdown and SGP audit: passed.
- Rebuilt artifact has zero empty directories. Its 1,196 file paths remain present; all
  resource/documentation paths and sizes match the pre-fix inventory. The recompiled minified
  ESM size changes by one byte; declaration-value parity and runtime tests pass. Bundle byte
  identity is not a contract of this correction.

Ignored evidence: `Build/distribution-asset-*`. Native release is not rerun: this fix changes
only directory emission, the focused fixture exercises both shared asset callers, and the
complete SceneGIS target plus browser suite supplies direct resource evidence.

No unresolved finding or public API/runtime change. The shared native copy helper also avoids
emitting new empty directories for original Cesium targets. Existing unrelated JSDoc warnings
remain unchanged. Approved for a local maintenance checkpoint.
