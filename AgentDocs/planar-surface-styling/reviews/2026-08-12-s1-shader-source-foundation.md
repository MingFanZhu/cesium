# Review: S1 Shader Source and Delivery Foundation

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Review target: working tree on `feature/planar-surface-styling` at base
  `d4c37b4f2e5adfa21397fb0bf5c363185e9681bf`
- Related plan:
  [S1 phase plan](../plans/2026-08-12-phase-s1-shader-source-foundation.md)
- ADR: `Documentation/SceneGIS/Decisions/ADR-0030-scenegis-shader-source-and-delivery.md`
- SGP: None

## Scope

复核8个SceneGIS GLSL source、Surface单token动态composition seam、Ground aggregator generated imports、
focused source/real-Context等价证据，以及dev/release/installed tarball与zero-upstream/generated边界。

## Summary

Execution已完成S1批准范围。固定Surface/Ground shader主体移入
`packages/engine/Source/Shaders/SceneGIS/**`；JS仅保留Surface layer生成、variant defines/selection与既有soft-private
aggregator shape。未修改public API、cache key、uniform map、pixels、commands、normal/lighting或resource semantics。
未commit、未push，未进入S2。

## Findings

| ID   | Severity | Status         | Owner role   | Location        | Finding                                | Disposition / evidence                                                     | Follow-up |
| ---- | -------- | -------------- | ------------ | --------------- | -------------------------------------- | -------------------------------------------------------------------------- | --------- |
| None | note     | not-applicable | architecture | S1 working tree | Architecture未发现actionable finding。 | 独立focused、release、installed-package、ownership/generated审计全部通过。 | None      |

## Validation reviewed

- SurfaceShader `5/5`；Surface aggregate `35/35`；Ground Primitive `7/7`；A7 real-Context qualification `1/1`。
- `npm run build`与`npm run build-release`通过。
- Installed engine/root tarball ESM/CJS verifier通过；dry-run tar inventory含8个source与8个generated modules。
- Scoped ESLint、Prettier、Markdownlint、`git diff --check`通过。
- Upstream audit：delivery upstream-owned files=`0`、generated status=`0`、SGP=None；basename uniqueness=`8/8`。
- Full types/API docs与Sandcastle/E2E按phase plan不要求且未运行。
- Architecture独立复跑：Surface aggregate `35/35`、Ground Primitive `7/7`、A7 real-Context qualification `1/1`；
  `npm run build-release`与`node scripts/scenegis/verify-planar-packages.mjs`通过。
- Architecture独立检查engine tar inventory，8个`.glsl`与8个generated `.js`均存在；8个SceneGIS basename在
  case-sensitive engine shader tree中各自唯一。
- Architecture独立运行official upstream audit与`git diff --check`：upstream-owned entries=`0`、generated status=`0`、
  SGP=None。

## Accepted risks

单一raw fragment template包含由`#ifdef`裁剪的inactive lighting branch，因此Cesium文本级builtin dependency scan可能
观察到inactive `czm_*` token。此风险不改变runtime语义：unlit/geometric/smooth均已在real Context编译并通过像素、
cache/resource warm identity；release与installed tarball也通过。该编译期升级检查点已记录ADR-0030与upgrade checklist。

## Conclusion

`approved`。S1固定Surface/Ground shader主体已迁入SceneGIS-owned GLSL root，动态layer seam、variant、pixels、cache、
uniform、command与resource semantics保持。无actionable finding；manual visual gate不需要。Upstream-owned files=`0`、
SGP=None、generated status=`0`。Architecture可创建S1独立中文本地checkpoint；checkpoint前不得进入S2。
