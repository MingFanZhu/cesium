# 未声明缩放范围的图层保持可见

- Type: standalone plan
- Status: completed；负责人视觉验收通过
- Created / updated: 2026-10-20
- Owner: 当前 Agent，Architecture / implementation self-review
- Architecture review: confirmed（负责人明确确认上下限缺省语义）
- Parent: [扩展索引](../README.md)
- Related: ADR-0058；upstream-owned files / SGP 增量：无
- Review: [自审与验收](../reviews/2026-10-20-implicit-zoom-bounds.md)

## 已确认问题

综合环境平面当前 style zoom 为 −0.179368，4 块瓦片已加载；球面当前 zoom 为 24.553009，
14 块瓦片已加载。两页 118 个样式层全部被隐式 `[0,24)` 范围排除，drawCommands 与 drawOrder 均为 0。
背景明确 visibility=visible 且没有 minzoom/maxzoom，在原 zoom 的只读求值为 false，在 0/23.999 为 true。
来源 SSE 分别选择 level 1 和 level 12–14，没有数据请求失败。

## 契约与实现

- 未声明 minzoom 表示无下限，未声明 maxzoom 表示无上限，两侧独立处理。
- 显式 minzoom 仍包含端点，显式 maxzoom 仍排除端点；visibility/filter 继续生效。
- 统一 public evaluateLayer、renderer cached evaluation、batch signature 和 symbol eligibility 的判断。
  不向 JSON 快照写入 Infinity，不改校验器或 source min/max level 的既有默认值。
- 原始连续 style zoom、参考深度、metersPerPixel、SSE、tile selection 与遮挡保持不变；
  不 clamp zoom，不增加俯角阈值、不放大线宽或文字补偿。
- 原视角验证暴露原先被 zoom 上限掩盖的 Worker 锚点膨胀：球面 12 块成功瓦片已有百万级
  重复线标注锚点，另 2 块在 postMessage 时内存不足。将重复锚点改为原路径分段的等差 station 范围，
  保留原 spacing / station；主线程沿现有 placement budget 用保守包围体递归剔除，
  仅展开可见区域候选。平面使用 XY + 既有地形高度范围，球面使用原生 rectangle OBB，
  不以新的数量上限、zoom clamp 或间距放大掩盖问题。点和 line-center 的语义不变。
- 修复属于已完成能力的维护，不替代 D2 仍待负责人人工验收的动态规则 gate。

## 验证与退出条件

1. Core 同时覆盖 omitted / 单侧 / 双侧显式范围、负 zoom、24 及更高 zoom、visibility/filter 和缓存求值。
2. 本地真实 GPU/Worker fixture 验证 background/geometry/symbol 在边界外可见且可拾取，
   连续往返跨越 0/24 后仍遵守显式范围；缓存、销毁与原有 source 层级不变。
3. 相关 Core、Layer、Symbols、Globe Specs 与开发构建；不扩大至既有无关 deferred pipeline 问题。
4. 保存当前两页 camera/time/config，刷新后原姿态对比；连续缩放跨边界检查画面、命令和瓦片，最后恢复。
5. 定向 ESLint/Prettier、AgentDocs 显式检查与 diff check。正式文档记录该 SceneGIS 缺省行为。

## 已知边界

平面已有复杂文字 shaping / 缺字错误独立保留，不能用它解释 fill/line/background 整层停绘。
不修改用户工作区已有环境和相机变更；2026-10-20 按负责人后续要求独立提交，未推送。

## 结果

2026-10-20 负责人确认“我已检查通过”。相关 152 项 Specs 中 151 通过，剩余 1 项为 D2 已记录的
旧 pick 派生对象路径失败；本次 6 项新增回归全部通过。原两页恢复绘制，球面 Worker 内存错误消失。
性能、连续缩放证据及测试边界见 review；本项完成不关闭 D2 原动态规则视觉 gate。
