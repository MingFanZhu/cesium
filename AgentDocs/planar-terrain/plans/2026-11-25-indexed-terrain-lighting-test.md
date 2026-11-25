# 平面索引地形光照测试维护

- 类型：standalone plan
- 状态：completed
- 日期：2026-11-25
- 作者角色：架构与执行
- 关联：[ADR-0012](../../../Documentation/SceneGIS/Decisions/ADR-0012-planar-terrain-lighting-and-geometric-normals.md)、[ADR-0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md)、[默认零高程地形评审](../reviews/2026-11-25-default-zero-terrain.md)、[光照测试评审](../reviews/2026-11-25-indexed-terrain-lighting-test.md)

## 目标

确认索引地形 Widget Specs 的模式和像素失败来自测试前提还是渲染行为。

## 实施与验收

1. 复现开启默认物理环境时的失败，核对物理光照和基础 Lambert 的优先级。
2. 隔离测试需要的光照路径，保留模式、像素、倍率、双面可见、深度与资源断言。
3. 用相同 Chrome WebGL 条件验证两个 Widget 用例及现有默认环境 Specs，记录结论。

## 确认的测试前提

默认物理环境启用后，索引网格已使用 smooth normal，基础 Lambert 倍率由另一条 Shader 分支读取。
旧测试直接切换 `enableLighting`，仍期待测试在 unlit 和基础 Lambert 之间切换。
Widget 用例在首次渲染前明确关闭默认物理环境，保留全部像素和资源断言。
测试通过公共 `Camera.getPickRay` 生成射线，使用对应运行时的视锥类型，发行版也能走完整拾取断言。
开发版和发行版各两项 Widget Specs 通过，默认物理环境下的真实平面地形光照对照也通过。
