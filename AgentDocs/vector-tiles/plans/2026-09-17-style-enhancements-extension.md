# Extension Plan：四类样式增强

- Type: extension plan
- Status: active
- Created / updated: 2026-09-17
- Owner / architecture review: 当前 Agent，architecture/execution 自审，approved
- Authorization: 负责人明确要求按建议补充纹理填充、动态要素状态、标注自动换位置、图标适配文字
- Baseline: `feature/vector-tiles@2f14780d81`；前一大阶段保持 completed
- Previous: [大阶段收口](../reviews/2026-09-17-milestone-closeout-review.md)
- Current phase: V3D2
- SGP: None planned

## 稳定目标与边界

延续独立 MVT、单 root matrix、自有批量绘制和现有 vector Worker，四类功能同时适用于 Planar/Globe。
不重新开启 hillshade、translate、heatmap、复杂 shaping、完整 PBR 或全场景 60 FPS 等延期范围。
Pattern 指 background/fill/line/fill-extrusion 的 sprite 重复纹理；它是矢量材质采样，不是地图颜色 RTT。
动态状态应能支持悬停、选中和业务着色，不重新请求 MVT、不重建无关图层，隔离异步旧结果。
可变 anchor 和 icon-text-fit 复用现有字形、sprite、placement 与 pick，避免逐帧重新 shaping。

## 阶段路线

| Phase | 目标           | 依赖与退出条件                                                           | 状态                                        |
| ----- | -------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| V3D2  | 纹理填充       | 共享 sprite、四类材质、双世界平面/贴地、pick/透明/生命周期及包验证       | active；[计划](2026-09-17-v3d2-patterns.md) |
| V3D3  | 动态要素状态   | V3D2 checkpoint；状态 API、依赖失效、Worker 代际、局部更新、拾取交互验证 | planned                                     |
| V5D   | 标注自动换位置 | V3D3 checkpoint；候选锚点、稳定选择、碰撞与相机运动、双世界资格          | planned                                     |
| V5E   | 图标适配文字   | V5D checkpoint；fit 模式/padding、sprite content/stretch、图文避让与拾取 | planned                                     |

一次只激活一个 phase，进入时细化源码设计。技术验证与自审后各自形成独立本地 checkpoint，再实施下一项。
四项由本次授权持续推进；最终提供 Test 人工入口，负责人对新画面的验收单独记录，不以技术提交冒充人工通过。

## 整体验收与风险

- 明确属性、表达式和资源失败语义；未知配置不静默降级。
- Specs 覆盖核心语义、真实 Worker、真实 WebGL、主线程资源与过时代际；Test 示例只组装并提供人工检查。
- 渲染热路径验证 warm resource identity、局部变更范围与可复现代表负载；不扩大为硬帧率保证。
- Shader/Worker 经现有 build/release/installed package 验证；公共 API 增量运行完整类型生成与检查。
- 不添加 upstream-owned 修改；确有需求再按 SGP/ADR 重新审计。
- 四项全部实现并完成技术验证后汇总兼容矩阵与未完成边界，交付负责人最终视觉验收。
