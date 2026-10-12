# Phase Plan: P0 隔离与接入审计

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Phase: `P0`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: Current task
- Created / Updated: `2026-10-13`
- Discussion: [接入与复用](../discussions/2026-10-13-command-integration-and-reuse.md)
- Review: [P0](../reviews/2026-10-13-p0-isolation-and-audit.md)
- ADR / SGP: 无新增

## Objective and entry conditions

负责人授权从当前 WebGL 成果新建分支探索延迟及相关效果；随后明确不强制保留完整
前向模式。P0 建立安全的开发基线，回答 DrawCommand 改动范围与 WebGPU 复用程度。
不在本阶段实现 Shader 或替换运行管线。

## Current source facts

- 已确认 `feature/webgl-rendering-quality` 工作区干净，HEAD 为 `5688deaeeb`。
- `Scene.updateDerivedCommands` 集中处理 pick/depth/HDR/shadow/OIT 派生；
  `Model.buildDrawCommands` 委托原生 scene graph。命令调度和内容构建并非一个接点。
- `ModelFS.glsl` 先求材质/CustomShader，再 lighting，然后样式、颜色、alpha、裁剪等。
  从最终 `out_FragColor` 无法无损恢复材质；集中接点不能消除材质家族适配。
- `_SceneGISLightingMrt.layout` 明确筛选资格，已有共享附件但不代表通用 G-buffer。
- WebGPU 在 Model 构建入口切换到 owned GPU model，提交独立 packet 与 WGSL。
  其工作量包含跨 API 资源适配，不是给全部原生 DrawCommand 加通用延迟标志。

## Detailed design and steps

1. 保留旧工作目录，在精确基线建立新的 managed worktree。
2. 创建 `feature/webgl-deferred-rendering`；不 cherry-pick WebGPU，不携带未提交工作。
3. 以知识图谱发现 WebGL 接点；图谱缺少 WebGPU 代码及 MRT helper 时定点读取源码。
4. 建立分层计划、内容类别矩阵、WebGPU 资格记录及下一阶段问题清单。
5. 文档格式、链接、Git 隔离验证；自审后形成独立 P0 本地提交。

## Affected paths and validation

只新增 `AgentDocs/webgl-deferred-renderer/**`，遵循 `_template` 的索引、plans、
discussions、reviews 结构。无 upstream-owned files、SGP、生成产物或产品行为变化。
本阶段只检查文档和 Git 状态；不运行无对应行为变化的 GPU、全量构建或视觉验收。

后继实现入口已核对根 `package.json` 与 DevelopmentGuide：`npm run build` /
`build-release`、`build-ts` / `tsc`、`test -- --includeName ...` 和 `test-e2e -- -g ...`。
GLSL 继续使用既有生成链，不能编辑生成的相邻 JS 或 Build/barrel 文件。

## Completion criteria and results

- 独立分支基于 `5688deaeeb`，原 WebGL 分支与原 WebGPU checkout 未被修改。
- 接入矩阵与 WebGPU 局限已记录；不声称已做完整命令枚举或运行回归。
- 负责人最新约束已经进入索引和总体计划；无强制永久双管线要求。
- 文档检查与提交结果见 P0 review；下一阶段在本 checkpoint 后单独细化。

## Remaining risks

尚未证明 G-buffer 编码、MSAA、完整材质和 GIS 的可行接法；这些是 P1/P2/P4 的
明确调查任务，不是本阶段批准的默认降级。需要改变产品契约时先确认。
