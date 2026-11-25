# 平面默认零高程地形评审

- 类型：Architecture/code review
- 状态：approved
- 日期：2026-11-25
- 评审角色：架构与执行
- 目标：[独立计划](../plans/2026-11-25-default-zero-terrain.md)
- 关联：ADR-0008、ADR-0010、SGP-0001、SGP-0002

## 结果

- 默认地形身份与资源（中，已修复）：World 通过内置 provider 声明零高程。实际瓦片覆盖、
  深度和地形拾取共用该地形，隐藏 World 后底色可见且拾取为空。无地形请求、Worker、
  逐瓦片 mesh 或 GPU buffer；稳定帧复用一个顶点缓冲。显隐及替换沿用覆盖和查询快照的生命周期。负责人角色：执行。
- 公共入口（中，已修复）：Scene、Viewer、CesiumWidget 与 World 共享 provider，赋值
  `undefined` 恢复同一实例。已验证 Globe 与 `globe:false` 的读取结果。通用属性的
  TypeScript 声明包含两种 provider；仅操作球面数据的代码可从 Globe 获取原生类型。负责人角色：执行。
- 既有地形光照断言（低，已确认基线）：`SceneGISPlanarTerrainCesiumWidgetSpec` 中的 indexed terrain
  光照用例在修改前 `a2c4e7471a` 和本次实现上，均出现相同的 lighting mode 与像素失败。
  使用同一 WebGL 测试分别加载基线和候选引擎复核。后续光照维护可复用此对照。

## 验证

Chrome Headless 158 严格 WebGL。World 与 CesiumWidget 28 项、Surface 与 Shader 54 项、
Viewer 25 项、URL Heightmap Provider 13 项和矢量贴地 18 项通过，发行版复跑默认地形绘制与
拾取用例通过。既有真实 quantized terrain Widget 用例通过。
本地试验页执行 0 米 → 30 米 → 0 米和隐藏地表，采样、驻留高度、拾取与资源计数符合预期。
完整发行构建、类型生成、TypeScript 检查和上游补丁审计通过。
