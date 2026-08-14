# A1 Render Foundation Implementation Review

## Metadata

- Review type: implementation
- Status: `approved`
- Phase: `A1 render foundation and dual-world frame contract`
- Branch: `feature/atmosphere-clouds-effects`
- Exact implementation base: `74a8bbadd72a805ca506f1841351009bdb62a8ea`
- Reviewer: Architecture Agent
- ADR: [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md)
- Upstream patch: active `SGP-0008`
- Architecture checkpoint: this A1 completion commit
- Push: none

## Implementation

- Added an optional advanced-background delegation after native environment rendering and before the existing SGP-0003 primary-world hook.
- Added an optional linear-HDR delegation after resolved color/depth/id acquisition and before built-in postprocessing.
- Added a private, single-Scene environment-effects pipeline with caller ownership, conditional detach, foreign-authority preservation,
  destroyed/duplicate/cross-Scene guards, inactive identity, and failure-atomic HDR publication.
- Added caller-owned, candidate-then-commit Globe/planar frame snapshots. Globe publishes ellipsoid-radial state; planar publishes fixed
  `+X East/+Y North/+Z Up` and planar Z relative to explicit base height.
- A1 remains pixel-identical and adds no public API, GPU resource, shader/asset, command, network request, listener, timer, or animation loop.

## Exact changed paths

### Upstream-owned product file

- `packages/engine/Source/Scene/Scene.js` — two paired SGP-0008 ranges; no SGP-0003 expansion or nesting.

### SceneGIS-owned product files

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsPipeline.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISAtmosphereReferenceFrame.js`

### Focused Specs

- `packages/engine/Specs/SceneGIS/Scene/SceneGISAdvancedEnvironmentRenderSlotSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipelineSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISAtmosphereReferenceFrameSpec.js`

### Records

- `AgentDocs/atmosphere-clouds-effects/README.md`
- `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a1-render-foundation.md`
- `AgentDocs/atmosphere-clouds-effects/reviews/README.md`
- `AgentDocs/atmosphere-clouds-effects/reviews/2026-08-14-a1-render-foundation.md`

No generated file, public index/declaration, shader, Worker, asset, Test/Sandcastle, package/build file, or second upstream-owned file changed.

## Validation

- `SceneGISEnvironmentEffectsPipelineSpec`: `7 SUCCESS`
- `SceneGISAtmosphereReferenceFrameSpec`: `4 SUCCESS`
- `SceneGISAdvancedEnvironmentRenderSlotSpec`: `5 SUCCESS`
- Minimal upstream `Scene/Scene` aggregate: `399 SUCCESS`
- `SceneGISWorld` order regression: `2 SUCCESS`
- `npm run build`: passed
- `npm run build-release`: passed
- `npm run build-ts`: passed with pre-existing repository TSD-JSDoc warnings; exit code `0`
- `npm run tsc`: passed
- Changed-scope ESLint and Prettier: passed
- Changed-scope Markdownlint and Prettier: passed
- `git diff --check`: passed
- `node scripts/scenegis/audit-upstream-patches.mjs`: passed after the final marker-boundary audit; upstream-owned=`1`, generated=`0`

Representative Specs cover native environment → advanced background → primary-world → geometry order; resolved HDR input before
postprocessing; pick exclusion; absent/inactive/detached pixels; OIT, globe depth, MSAA and HDR; resize and resource identity; attachment and
invalid-return failure atomicity; Perspective/Orthographic camera movement; high/ground Globe radial state; fixed-axis planar state; finite,
result-identity and last-good publication.

## Unrun boundary

- Full repository suite, full browser matrix, package/install and E2E were not run because A1 changes only the focused private foundation and
  the required minimal Scene integration seam.
- `build-docs` was not run because A1 adds no public JSDoc/API surface.
- No visual manual gate was requested because A1 intentionally has zero visible effect.
- No future atmosphere, fog, cloud, shadow, god-ray, bloom, flare, temporal or asset validation was run.

## Deviations and tool limits

- No architecture or allowed-path deviation was required; no adapter split, second SGP, second upstream file, raw GL, framebuffer or dependency
  was introduced.
- To keep exactly two SGP-0008 marker ranges and avoid an upstream import hunk, Scene delegates to validated private authority methods already
  attached to the Scene.
- Cross-bundle-safe structural validation is used for private runtime values; projection kind is derived from the projection matrix instead of
  relying on fragile `instanceof` identity.
- The codebase graph lacked recent private SceneGIS nodes and a reliable `resolveFramebuffers` prototype mapping. Exact source/string fallback
  was used and recorded as an index limitation.

## Ownership, activation, and remaining risks

- The only upstream-owned file is `packages/engine/Source/Scene/Scene.js`, tracked by active `SGP-0008` and governed by ADR-0040.
- Per the A1 plan, `.scenegis/upstream-patches.json` remains unchanged until Architecture review accepts the real Specs; review completion must
  set SGP-0008 to `active` and record the exact three Spec paths.
- Private compatibility currently depends on Scene soft-private authority storage, Renderer texture `_context`, and projection-matrix shape.
  Focused Specs lock these assumptions, but future Cesium upgrades must re-audit them and both Scene integration positions.
- Architecture review and its local checkpoint remain outstanding. A2 is not active and no A1 commit or push has been made.

## Architecture findings

No blocking findings.

Architecture独立复核确认：

- `Scene.js`恰有两个non-nested paired `SGP-0008` ranges；background delegation位于native environment之后、`SGP-0003`
  之前，HDR delegation位于resolved color/depth/id acquisition之后、built-in postprocess之前。
- Pipeline absent/inactive保持identity；attached authority、duplicate/cross-Scene guard、conditional detach、foreign replacement、
  Scene-first destroy与invalid HDR return均符合A1 caller-owned/failure-atomic contract。
- Globe publication只消费live Globe/ellipsoid radial state；planar publication固定`+X/+Y/+Z`、explicit base height，focused
  Proxy evidence证明它不读取Scene ellipsoid。Candidate validation在result commit之前完成，last-good result保持。
- 新增product/spec paths全部位于allowed scope；没有第二个upstream file、public API、GPU resource、raw GL、asset、generated或
  build/package change。
- Architecture没有重复Execution已完成的大型build矩阵；以source review、diff/marker boundary、AgentDocs consistency、
  activated SGP audit和changed-scope static checks关闭gate。

## Architecture disposition

- Review=`approved`；A1=`completed`，无manual gate。
- `SGP-0008`已补入三个真实Spec路径并转为`active`；official audit通过后纳入A1本地checkpoint。
- 剩余soft-private upgrade risks已在上文保留，属于A2 entry/source re-audit，不阻塞A1。
- A2未激活；不得把A2实现混入本checkpoint。
