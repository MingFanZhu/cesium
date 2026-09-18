# 平面 Entity 通用属性兼容性修复

- Type: standalone plan
- Status: active；实现与技术自审完成，待负责人验收
- Created / Updated: 2026-09-18
- Owner / review: 当前 Agent；未启用独立评审 Agent
- Parent: [Entity API audit](../reviews/2026-09-18-entity-api-compatibility.md)
- Decisions: ADR-0015 / ADR-0016 增量；Rectangle 继续遵循 ADR-0019
- SGP / upstream-owned changes: None

## 范围与实现

负责人允许修复部分问题，并接受为复用 Cesium 类型而保留平面字段解释。本轮关闭 EA-R001，
补齐 EA-R003 的 Polyline/Polygon distanceDisplayCondition；EA-R005 的米制 Rectangle 解释保留并明确记录。
CustomDataSource 边界、材质、原生 Entity.computeModelMatrix 和 VelocityOrientationProperty 不在本轮修改。

1. Gate 仅拒绝未支持的原生 Entity Property；通过 Entity.prototype 区分 Cesium 内建与 addProperty 的业务属性。
2. Polyline/Polygon 继续使用原 Graphics 和 Property。距离条件进入既有 GeometryInstance 属性，fill 与全部 outline 一致。
3. 未设置条件时保持原 shader / attributes；添加或移除条件可替换 owner。仅修改 near/far 时复用已 ready 的 geometry/VA/commands，
   尚未 ready 时允许替换 CPU candidate；非法值不得修改当前 owner。Cesium 默认 far=Number.MAX_VALUE 在 GPU 属性中使用有限 Float32 上限。
4. 保持 original Entity picking、show/availability、ground backend、资源所有权和销毁契约；不修改 Shader 或 Cesium 原文件。

## 验证与退出

- 回归业务属性初始/动态添加、更新、删除；未知 Cesium 标准 Graphics 仍在 child update 前拒绝。
- 条件初始值、动态 near/far、添加/清除、非法值原子性、缺省 far 与未 ready 更新 Specs。
- 实际 WebGL 验证普通 line / polygon fill + outline 的可见、隐藏和 picking；ground 仅在同后端通过像素验证后声明支持。
- warm owner/VA/command identity、remove/destroy 无资源遗留；只运行相关内容 Specs。
- 完整构建与类型检查；更新 ADR、兼容矩阵、指南和审计处置。

## 实现与验证结果

EA-R001 已修复；EA-R003 距离显隐已覆盖 ordinary/ground 和 polygon fill/outline，材质范围不变。
EA-R005 按负责人意见 accepted，保持米制字段解释并明确使用约定。具体处置见
[技术自审](../reviews/2026-09-18-entity-api-fixes.md)。没有 upstream-owned 或 SGP 增量。

新增 6 项实际 WebGL 用例及 metadata 回归通过；首轮定向 30 passed。
扩展回归 118 passed、2 个既有失败；将本轮三个既有 runtime 文件还原为修复前内容后，两项失败原样复现，
已经恢复全部文件并重新构建。旧资格 fixture 问题和剩余 API 限制记录在 review，未纳入本次修复。

build / buildRelease / buildTs / buildDocs 与 root/engine TypeScript 通过；buildTs 有既有 TSD-JSDoc warnings。
源码 ESLint、修改文件格式、全 AgentDocs Markdownlint 与 git diff --check 通过。
全 AgentDocs Prettier 仍有 285 份既有无关文件未通过，本轮涉及文件通过；生成文件无 tracked 改动。
没有提交或 push 混合工作区；负责人页面验收尚未进行。
