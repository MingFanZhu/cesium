# Extension Plan: 分段 Gaussian 迁移

## Metadata

- Plan type: extension
- Status: active
- Owner role: architecture
- Architecture review: confirmed（本任务）
- Created / updated: 2026-10-23
- Related discussions / reviews: None
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: P1 None

## 目标与边界

把旧自有分段 Gaussian 方案迁入 Cesium 1.144 SceneGIS，保留数据格式和资源预算，
提供原生图元与独立 CPU 切片工具。固定网格加载/切片、训练蒸馏、SDK 不迁入。
旧仓库只读；不将旧上游修改整包覆盖到当前引擎。

## Source facts

来源提交 `9f90975b4f478b4795df96a1112bd6518f9d22a7` 加当前工作树的分段修正与 authored LOD 工具。
目标基线 Cesium 1.144；已有 Gaussian pass、SceneGIS shader/worker 交付规范。

## Phase roadmap

| Phase | Objective           | Dependencies  | Entry gate       | Exit gate                                     | Status  | Plan                                     |
| ----- | ------------------- | ------------- | ---------------- | --------------------------------------------- | ------- | ---------------------------------------- |
| P1    | 共享协议与 CPU 工具 | 无            | 依赖调查与 ADR   | Node/CLI 验证、review、本地提交               | active  | [P1](2026-10-23-p1-tool-and-protocol.md) |
| P2    | 原生分段渲染与交付  | P1 checkpoint | 重新审计渲染接入 | Specs、构建/类型、示例/性能、review、本地提交 | pending | 待进入时建立                             |

## 整体验收与风险

- 独立分段图元可加载旧产品及本工具新产品；球面 ENU、平面米制通过显式刚体矩阵放置。
- 无 fixed10 入口、训练框架、SDK 修改或 engine→Tools 依赖。
- 原生异步准备、排序、预算与销毁可验证；真实混合场景画面与性能证据可复现。
- 新 API、Worker、Shader 的 dev/release/types 交付通过；每阶段形成独立本地提交。
- 原方案规模较大；迁移保留算法，避免同时改写选择/reducer 行为。真实大型资产与设备性能不能由小型 fixture 代替。

## Handoff

当前 P1；下阶段细节必须在 P1 提交后据源码建立。
