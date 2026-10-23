# Phase Plan: 原生分段渲染与交付

## Metadata

- Plan type: phase
- Status: completed
- Parent plan: [migration](2026-10-23-migration.md)
- Phase: P2
- Owner role: architecture / execution
- Architecture review: confirmed（本任务）
- Created / updated: 2026-10-23
- Related review: [P2](../reviews/2026-10-23-p2-rendering.md)
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: SGP-0067

## Entry facts

P1 checkpoint `040e7d72f6`；78 Node tests 与 dev build 通过。
旧 renderer 使用自定义 RAD_SPLATS，当前 native Gaussian pass 已按包围体中心排序且支持 deferred。
旧 Texture2DArray 为通用复制实现；分段 atlas 实际只需 RGBA32UI storage 和 subimage upload，
因此改用窄小 owned texture wrapper，不复制旧通用 Texture 类、不改 ContextLimits。
旧 mapping/sort worker 由 TaskProcessor 使用，entry 包装与算法必须分离。

## Design and steps

1. 迁移唯一 public primitive、分段 Scene helpers、Core worker handlers 和 owned shaders。
2. 两个准确命名 Worker entries 复用现有构建；自有 RGBA32UI array 读取原生 GL limit。
3. `createUniform.js` 以 SGP-0067 增加 integer array sampler 分派；命令使用 GAUSSIAN_SPLATS。
4. 清除 fixed10 loader 的 legacy descriptor 分支和 shader 分支，补齐英文 public JSDoc。
5. 迁移当前有效 Jasmine Specs，补充真实 WebGL/Worker 与 mixed-scene/lifecycle 验证，
   覆盖 P1 G3 中当前 receipts/SH/排序/销毁契约。
6. Test 示例使用本地确定性小数据与可填 URL，支持球面/平面放置；不改 SDK。
7. dev/release/types/tsc、SGP audit、浏览器验证与有边界性能记录，review 后提交 checkpoint。

## Acceptance and risks

旧分段资产与 CPU 工具产物均加载；不支持 fixed10 路由。公开预算继续显式配置，
保留资源上限、过时代际隔离、部分 SH 就绪和异步销毁。pick/depth 不推进流式工作。
多实例仍按 command 排序，非跨实例逐 splat 全局排序；不把 Gaussian 当作可重光照 PBR 材质。
运行时禁止 Node/Tools 依赖和 GPU CPU readback。大资产性能仍需实际设备/数据判断。

## Deviations and results

完成原生图元、两个 Worker、RGBA32UI atlas wrapper、owned shaders、SGP-0067、CPU 合成示例。
迁移中保留当前协议，修正 Scene 立即销毁时 VAO 延迟释放的问题；atlas 清理后分配统计归零。
旧 Specs 升级为当前 MCI4/receipt/padding 契约，移除重复且陈旧的手工 FullChain harness，
以公共 API + real Workers + real Scene 的 ENU/Planar Specs 取代。
248 项严格 WebGL Specs 通过，P1 的 78 Node tests 仍为协议/工具资格。
构建、类型、发布资源、视觉与性能记录详见 P2 review。无 SDK 和 fixed10 入口。
