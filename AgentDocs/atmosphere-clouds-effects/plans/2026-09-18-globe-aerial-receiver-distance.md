# 球面空气透视模型条带修复

- Type: standalone plan
- Status: active; implementation verified; project-owner visual acceptance pending
- Created / Updated: 2026-09-18
- Owner / architecture review: 当前 Agent；confirmed
- Baseline: `scenegis/develop@69f76a94c6`
- Parent: [环境扩展](2026-08-14-atmosphere-clouds-effects-extension.md)
- Review: [技术自审](../reviews/2026-09-18-globe-aerial-receiver-distance.md) — approved；负责人视觉验收待定
- Upstream-owned files / SGP delta: None

## 复现与根因

负责人在 `Test/AdvancedEnvironment/球面物理大气.html` 看到最右侧方块下部水平条带和红色细线。
关闭 `showAerialPerspective` 后条带消失，排除 glTF 材质本身。当前视角 camera height 600 米，
条带上下真实 resolved receiver 距离均约 20.5 km。

`SceneGISEnvironmentEffectsAerialFS → sceneGISGlobeStableTerrainDistance` 把所有 opaque receiver
当成地形，在 8–50 km 距离或 2–27 km camera height 下把 atmosphere endpoint 高度向零压缩。
当模型上的压缩高度穿过 camera height 时，正向球交点从接近零切为无有效交点，fallback 突然恢复
真实约 20.5 km 距离，造成错误的透射/散射跳变。Meter-scale sphere subtraction 还会量化这些交点。
图谱确认该 helper 只被 AerialFS 消费；cloud selection 已使用原始 distance。

## 修复范围

- Aerial 和 exponential fog 直接消费当前 opaque resolved depth 重建的真实 ray distance，
  不从距离/相机高度推断 receiver 是 terrain，不移动 receiver 到另一个球壳。
- 删除无调用的 stabilizer 与四个阈值；保留 current-frame depth availability、native precise log decode、
  clear-depth identity、Bruneton 物理参数、cloud occlusion、Planar 路径与资源所有权。
- 在 ADR-0043 记录真实 receiver endpoint 的长期约束，并标记 A8-AR-006 稳定化方案被本项取代。
- 复用现有 shader build 与 `SceneGISEnvironmentEffectsSpec` GPU helpers；不改上游、API、LUT、Shader builtin 或构建器。

## 验证与退出

1. 增加真实 opaque box 的 GPU 连续性回归：旧代码失败、修复后通过，深度距离连续时不得产生横带。
2. 复用 linear/log far opaque、精确 depth reconstruction 与 fog GPU cases；保留 stale-depth/clear identity 和资源检查。
3. 当前用户页面同视角复测，保留空气透视，确认条带消失；观察地形/远景没有明显新增断层。
4. 构建与 scoped lint/format、AgentDocs 检查、upstream audit；记录 shader 成本/资源变化（不新增 pass/resource）。
5. 写回实际证据和自审。最低充分证据后停止扩展矩阵，负责人画面判断为最终质量依据。

## 实现与验证结果

- 删除 terrain-distance stabilizer，AerialFS 的有限距离大气和 height fog 统一使用原始 resolved receiver distance。
  未修改示例、材质、光学强度、native depth guard 或上游文件；ADR-0043 记录契约与历史方案替代关系。
- 新增 elevated opaque box GPU 回归：旧实现内部相邻行 RGB 最大阶跃为 59，超过阈值 12；修复后通过。
  同时断言空气透视对输出确实有影响，避免关闭效果后假通过。
- 以下 5 项 ChromeHeadless GPU 检查各 1/1 通过：
  `keeps Globe aerial color continuous across an elevated opaque receiver`、
  `reconstructs immutable linear and log depth exactly across both worlds`、
  `renders every far opaque Globe pixel through linear and log aerial variants`、
  `renders the full clear-depth Globe fog medium with physical directional Sun on the actual GPU`、
  `selects precompiled linear and log-depth aerial variants without resource churn`。
- `npm run build` 通过并更新忽略的 shader JavaScript / bundle；生成文件不进入交付。
  只运行当前源码的针对性测试，未将 `--production` 测试参数表述为 release qualification。
- 浏览器刷新后，当前球面物理大气页面保持原视角与空气透视开启，右侧方块表面条带及红色接缝消失；
  地形/远景未见新增断层，效果 ready，控制台无 warning/error。
- 删除每个有限深度像素的 smoothstep、球交点及相关向量运算；未新增 pass、texture、uniform 或 allocation。
  资源切换回归通过。未做独立性能基准，不声称测得帧率提升。
- 静态检查与 ownership 审计结果见技术自审。

## 当前交接

- 实现与技术自审完成。当前 Agent 未代替负责人作最终视觉验收；本项代码与文档尚未提交。
- 实际远处地形 LOD 引起的 depth 变化可以改变大气光程，旧的人工 LOD-invariance 不再承诺。
  已移除只验证该变形行为的断言，保留真实远深度、stale-depth、clear identity 和雾回归。
- 无新增 API、SGP 或未处置的技术阻塞；下一步按负责人对当前页面的视觉反馈关闭或继续本 standalone plan。

## 平面对照排查 — 2026-09-18

- 负责人追加询问平面是否存在同类问题；本轮范围为检查与复现，未修改平面产品代码。
- `Test/AdvancedEnvironment/平面物理大气.html` 默认视角下，三个方块在屏幕地平线附近均出现水平色带。
  关闭 `showAerialPerspective` 后模型恢复连续颜色，重新开启后色带恢复；测试开关已恢复，无浏览器 warning/error。
- 这是相似画面缺陷，但不经过已删除的 `SCENEGIS_GLOBE` terrain-distance stabilizer。
  图谱与源码确认 AerialFS 将原始 `distanceToPoint` 传给 `sceneGISPlanarRadianceToPoint`，后者使用 fixed-Z
  slab segment、解析 transmittance 和首末端 scattering LUT 差分。不能把球面根因直接归给平面。
- 当前构建上两个既有 GPU cases 各 1/1 通过：
  `renders real opaque planar depth through linear and log aerial variants` 和
  `keeps Planar P5 far transport complete and aerial sources continuous on the actual GPU`。
  它们不能证明当前模型跨地平线表面连续，已复现画面优先于这些有限断言。
- Follow-up status: open；owner: 当前实现 Agent。后续修复先补充该平面画面的失败回归，再隔离 finite scattering
  在跨水平视线时的连续性；根因尚未确认，不先引入平滑、经验阈值或额外采样。
  本发现独立于前述球面修复的技术验证，不宣称平面已修复。
- 负责人随后明确要求单独修复平面；实现已转入独立的
  [Planar standalone plan](2026-09-18-planar-aerial-horizon-band.md)，本节保留原始排查结论。
