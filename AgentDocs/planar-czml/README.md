# 平面 CZML

## Metadata

- Extension slug: `planar-czml`
- Status: completed
- Planning model: standalone
- Active extension / phase plan: None
- Current phase: None
- Active standalone plan: None；[Native loading](plans/2026-10-20-native-loading.md) completed
- Architecture / execution contact: 当前任务
- Last updated: 2026-10-20

## Scope

原生 CZML 的实例级 World 绑定、米制 XYZ、时间属性、动态对象、Path 和既有 Viewer 定位/跟随。
不提供自动投影、惯性系、椭球速度朝向、新材质或新的渲染后端。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarCzml.js`
- Specs: `packages/engine/Specs/SceneGIS/DataSources/SceneGISPlanarCzmlSpec.js`
- E2E: `Specs/e2e/scenegis-planar-czml.spec.js`
- Example: `Test/平面CZML.html`
- Integration branch: `scenegis/develop`；implementation branch: `feature/planar-czml`
- ADR: [ADR-0173](../../Documentation/SceneGIS/Decisions/ADR-0173-planar-czml-loading.md)
- SGP: SGP-0063

## Current handoff

- Current state: 实现、240 项 Specs、开发/发布 E2E、完整 release、类型和技术自审通过。
- Next action: 负责人已授权本地提交并合并至 `scenegis/develop`；未 push，人工观感仍可通过本地示例验收。
- Open discussions / unresolved reviews: None
- Latest review: [Native loading](reviews/2026-10-20-native-loading.md)
- Known risks: 沿用既有 Graphics profile 和 native 非事务加载语义；带导数的 forward HOLD
  原生 stride 缺陷保持同等行为，见 review。人工最终观感尚待验收。
