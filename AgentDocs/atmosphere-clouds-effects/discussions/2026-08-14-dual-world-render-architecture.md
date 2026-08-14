# Discussion: Dual-world advanced environment rendering

## Metadata

- Status: `resolved`
- Date: `2026-08-14`
- Owner: Architecture Agent
- Related extension:
  [atmosphere-clouds-effects](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Decision: [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md)

## Questions

1. 是否直接移植 `cesium-clouds-atmosphere` 的 raw WebGL、texture assets 与 post-render pipeline？
2. Bruneton spherical atmosphere 如何同时支持 fixed-axis planar world？
3. Cesium 现有 public `PostProcessStage` 是否能满足 aerial perspective、cloud 与 lens flare 的 HDR 合成顺序？
4. 第一阶段是否立即冻结 public effects Controller 与完整参数表？

## Source findings

- Cesium 1.144 的 `Scene.renderEnvironment` 在 ordinary geometry 前绘制 native sky/atmosphere/body，并通过
  `SGP-0003`给 non-Globe primary World 一个 environment slot。
- `Scene.resolveFramebuffers` 在 geometry、OIT 与 translucent classification resolve 后取得 color/depth texture，再调用
  `PostProcessStageCollection.execute`。
- `PostProcessStageCollection` 的顺序是 ambient occlusion、built-in bloom、auto exposure、tone mapping、custom stages、FXAA；
  普通 custom stage 位于 tone mapping 之后，不能承担统一的 linear-HDR atmosphere/cloud composite。
- Native `SkyAtmosphere`建立 ellipsoid shell；native `Fog`与 `Camera.positionCartographic`保留 Earth/ellipsoid 语义，不能作为
  planar height contract。
- 参考仓库检查固定在 commit `1f38602b84ab5c3f2bc289f9e4464df3db917155`；其license为MIT。该版本以raw
  `viewer.scene.context._gl`、WebGL framebuffer/texture/PBO、`camera.positionCartographic.height`和运行时asset fetch组织原型；
  atmosphere/cloud资源原始体量约30 MB，且存在`three`/GUI辅助依赖。该结构不满足SceneGIS Context ownership、
  build/package delivery、planar coordinates与failure-atomic lifecycle约束。

## Resolution

1. **参考算法，不移植运行时。** 参考仓库只用于识别 Bruneton LUT、cloud raymarch、Beer shadow、temporal accumulation、
   aerial perspective 与 image-based lens flare 的职责。任何代码、shader 或 asset 若后续采用，必须逐项完成 license、provenance、
   format、精度、体量和 Cesium Renderer API 重实现审计。
2. **共享光学核心，分离 reference-frame adapter。** Globe 使用 ellipsoid center/radii、radial altitude 与 atmosphere shell；
   planar 使用 `+X East/+Y North/+Z Up`、显式 base height 与分层 slab。两者共享 physical coefficients、Sun authority、LUT/noise
   interfaces、quality tiers 与 compositor，但不要求 pixel-identical，也不把平面坐标转换成伪 ECEF/Cartographic。
3. **增加一个 scene-wide 双阶段窄 hook。** proposed `SGP-0008`在 `Scene.js`提供 background slot 与 pre-postprocess linear-HDR
   composite slot；不修改 `PostProcessStageCollection` public order，不复用只服务 primary World 的 `SGP-0003`，不访问 raw `_gl`。
4. **A1 不冻结 public API。** A1 只建立 private pipeline、attachment/lifecycle、reference-frame publication 与 render-order Specs。
   A2 在 Bruneton atmosphere + aerial perspective 有真实 pixels、resource budget 与 failure evidence 后再冻结 caller-owned public
   Controller、defaults、native-effect conflict 和 fallback contract。
5. **默认无成本、按能力降级。** 所有高级效果后续默认关闭；disabled path 不分配 LUT/noise/FBO、不维持动画 render loop。
   Advanced profile 可要求 WebGL2/float texture/depth texture，但必须有显式 capability result 和保留现有环境的 fallback。

## Consequences

- A1 会修改 upstream-owned `packages/engine/Source/Scene/Scene.js`，仅允许 paired `SGP-0008` hunk；任何第二个 upstream file
  都是 scope escalation。
- ADR-0036 的 simple planar atmosphere 继续作为独立、默认关闭的 lightweight/fallback renderer；新扩展不会在 A1 改写它。
- ADR-0039 的 non-Globe native Fog/Sky guard 保持；后续 advanced planar path 仍由 SceneGIS-owned renderer承担。
- Asset generation、compression、license manifest 与 npm/root delivery 是 A2 entry gate，不能把临时 clone 或公网 URL变成运行时依赖。
