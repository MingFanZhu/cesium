# Extension Plan: Directed observer viewshed

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: current task self-review; no independent agent
- Created / Updated: 2026-10-21
- Related discussions: user-approved observer depth / independent streaming proposal
- Related reviews: None
- ADR: [0176](../../../Documentation/SceneGIS/Decisions/ADR-0176-observer-viewshed.md)
- SGP: SGP-0065（V2 integration；V1 无上游修改）

## Objective

提供显式 Scene / World 绑定的定向可视域：观察点深度表示遮挡，
主画面接收点重投影比较后叠加可见 / 不可见颜色。球面 ECEF 与平面世界 XYZ 均使用米。
主相机移开遮挡物时不能改变固定观察点的分析结论。

## Non-goals

首轮不做 360 度、多观察点布尔运算、精确面积统计、结果导出、
透明水面或半透明介质透射，也不修改太阳阴影设置。

## Stable architecture boundaries

- 独立观察点几何选取与资源保护；共享已经加载的瓦片、模型、VA 和解码缓存。
- 所有者明确，停用和销毁不遗留资源、监听或异步发布；不能污染主相机、
  主视锥、拾取、地形查询和太阳阴影。
- 原始顶点变换、instancing、animation、CustomShader / flatten、alpha discard
  和 clipping 必须保留；显示滤波不改变分析判定。
- 未完成覆盖不能被标记为确定可见；明确 loading / ready / error。
- 真实表面参与遮挡，terrain skirt 不冒充真实挡墙。首轮 opaque / MASK，
  分类、注记、辅助线及透明内容不作为遮挡体。
- SceneGIS-owned 实现；必要 upstream hook 必须小且显式，以 SGP 登记。

## Source and baseline facts

起点 `2677cde2a0`，官方 1.144 基线见 `.scenegis/upstream-base.json`。
原生 Scene shadow pass 只遍历主 commandList；旧版 Visible 也有此限制，
并改写 fragment shader、使用主相机相关 bias，不能直接迁移。
原生 `DerivedCommand` 可复用 depth-only 与 log-depth。
3D Tiles 有独立 `updateForPass`；Planar terrain、Globe quadtree 与 S3M
仍有单视图选取 / 帧预算状态，需要在 V2 依据实际调用关系隔离。

## Phase roadmap

| Phase | Objective                                       | Dependencies  | Entry gate                       | Exit gate                                          | Status    | Phase plan                         |
| ----- | ----------------------------------------------- | ------------- | -------------------------------- | -------------------------------------------------- | --------- | ---------------------------------- |
| V1    | 独立深度资源、原生命令派生和精度基础            | 当前 renderer | 源码边界明确                     | GPU discard / 变换 / 状态恢复 / 释放通过，独立提交 | completed | [V1](2026-10-21-v1-depth.md)       |
| V2    | 观察点数据选取、加载状态、World 绑定 API 与显示 | V1 commit     | 重新核对各 provider 的状态和预算 | 屏幕外遮挡、加载与动态更新正确，独立提交           | completed | [V2](2026-10-21-v2-integration.md) |
| V3    | 双世界综合示例、集成回归与性能验收              | V2 commit     | 功能可完整运行                   | 可复现画面、生命周期与运行开销证据，独立提交       | planned   | Not entered                        |

## Cross-phase validation

针对 Globe / Planar 大坐标、主相机独立性、地形连续缺失层、3D Tiles / S3M
LOD、MASK / clipping / flatten、实例化与动画分别设置直接证据。
每阶段只运行对应风险的最小充分测试；公共 API / shader 交付运行完整构建与类型检查。

## Global risks and dependencies

观察点流式加载增加内容与 draw 开销，不能假设可以免费借用主视图瓦片。
单张观察点深度的有限分辨率、near / far 精度与边缘采样是公开质量边界。
程序化 shader 或 bounds 错误不能通过 bias 和隐藏 retry 掩盖。

## Overall acceptance criteria

固定观察点在主视图移动后保持遮挡结论；数据覆盖状态诚实；两种 World
正确支持地形及模型类内容；显示不反馈曝光；销毁无资源残留。
项目负责人完成最终视觉验收后再讨论 SDK 集成。

## Progress and handoff

V1 completed，checkpoint `04101ff1ea`；V2 completed，等待 checkpoint。当前任务承担架构、实现和自审；未启用独立 Agent。
每阶段完成代码、测试、ADR / SGP 与 review 后创建本地 checkpoint 再进入下一阶段。
