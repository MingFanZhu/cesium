# Review: P3b 共享线性深度

## Metadata

- Status: approved，技术与负责人视觉 gate 均通过
- Reviewer role: architecture，当前任务自审；未启用独立评审 Agent
- Target: P3a checkpoint `085f47e8f7` 之后的 P3b
- Parent: [P3b](../plans/2026-10-13-p3b-shared-screen-depth.md)
- Decision: [ADR-0158](../../../Documentation/SceneGIS/Decisions/ADR-0158-shared-deferred-depth.md)
- Created / Updated: 2026-10-13

## Findings and disposition

| ID         | Severity | Status   | Owner         | Evidence and follow-up                                                                                                                                       |
| ---------- | -------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WDR-P3B-01 | high     | fixed    | execution     | 深度转换对背景 discard，但独立 Deferred 未清零。移动模型后旧像素仍读到 8.5 米，新增真实 GPU Spec 在修复前失败、修复后为 0。每帧先清零所选目标。              |
| WDR-P3B-02 | medium   | fixed    | execution     | Deferred 与当前 MRT owner 重复存储/转换相同深度。屏幕光照前直接写 owner 目标，resolve 省略重复转换与 depth blit；三个 owner 的深度、HDR 与转换次数均已验证。 |
| WDR-P3B-03 | medium   | fixed    | execution     | 借用 Texture 与自有 manager 分离。逐帧选择；切换共享时释放旧自有目标。测试覆盖 disable/destroy 不销毁 borrowed、resize、恢复独立目标和最终 Scene 销毁。      |
| WDR-P3B-04 | boundary | accepted | architecture  | 只消除 R32F 副本和重复工作，原有 raw depth snapshot 分配仍保留；没有移除 SSR/SSIL 响应附件或改变 AO 法线。整帧改善未形成一致结论，不声明普遍提速。           |
| WDR-P3B-05 | gate     | accepted | project owner | 负责人于 2026-10-13 选择 A，接受本轮共享深度街道结果，批准形成 P3b 独立提交并继续。                                                                          |

## Correctness and lifecycle

Chrome Headless 155 真实 WebGL，开启 webglValidation：

- DeferredLighting **13/13**，其中新增 4 项：移动后背景清零，AO/SSR/SSIL 各自的 owner
  切换、MASK 深度、正交/透视日志深度、resize、借用与自有销毁；既有普通遮挡、透明、
  256 灯、水面和阴影检查保留。
- AmbientOcclusion **14/14**、ScreenSpaceReflections **13/13**、
  ScreenSpaceIndirectLighting **13/13**、WaterSurface **17/17**。
  合计 **70** 项，覆盖既有非延迟、MSAA 与共享 consumer 调度。

Bistro E2E **1/1**：1280×800，Globe，原街道资产与材质，单采样。
14:00/22:00 对照现有光照；附加 14:00 SSIL 组合。HDR 相对误差均值分别约
0.00001989、0.00000136、0.00001990，最大约 0.01718，无非有限值。
这是前向与延迟的既有精度差，不是 P3b 新引入的差异。

另在改动前后保存同固定视图、14:00、AO/SSR/SSIL、TAA 关闭的完整 HDR，
P3b 对 P3a **均值/最大误差均为 0**。相机移动 24 步启用 TAA 与全部三个效果，
目标复用且深度身份一致；最终 Scene 销毁释放目标，无 pageerror/renderError。
已查看移动后与自动曝光夜景截图；截图不替代负责人 gate。

## Cost evidence

RTX 3060 Ti，Edge 155 / ANGLE D3D11，1280×800，627 次材质 + 1 次光照，
14:00 原餐馆视图。效果算法、预算与参数不变；成本保留 TAA，每组 12 个有效 GPU timer
样本、无 disjoint，偶数样本中位数按中间两项平均：

| 配置           | P3a GPU 整帧 | P3b GPU 整帧 | P3a/P3b CPU 提交 |
| -------------- | -----------: | -----------: | ---------------: |
| TAA + AO + SSR |    15.762 ms |    15.841 ms | 17.40 / 16.75 ms |
| 上述 + SSIL    |    17.754 ms |    16.486 ms | 17.15 / 16.40 ms |

短测帧耗时含提交波动：第一组没有整帧提速，第二组不能全部归因于深度去重。
确定性收益是一张 R32F（4,096,000 bytes / **3.90625 MiB**）、一次 fullscreen
深度转换和一次 depth blit。Deferred 自有附件 **35.15625 → 31.25 MiB**；
这是该模块附件存储，不是整场景显存。没有减少原几何数或效果采样数。

## Delivery and next action

全部运行时改动位于 SceneGIS-owned 路径；**本阶段 upstream-owned files 为 0，无新增 SGP**。
依赖既有 SGP-0046 调度，未修改原生 Scene 或 Shader，未手改/提交生成物。
完整 dev build、定向 ESLint、70 项 GPU Specs、街道 E2E 与补丁审计通过。
完整 release / build-ts / tsc 通过（类型生成保留原有上游 JSDoc 警告）。
改动文件 Prettier 与全目录 AgentDocs Markdownlint 通过；全目录 Prettier 仍有
416 个既有未改文件警告，不顺带修改历史文档。
负责人于 2026-10-13 接受视觉结果；当前架构任务确认 P3b completed，形成独立本地 checkpoint 后再调查 P4。
此次验收不表示获得新的画质算法或全面延迟替换资格。
