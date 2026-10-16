# Globe 地平线样式比例修复

- Type: standalone plan
- Status: completed; owner visual gate passed
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review
- Architecture review: confirmed
- Baseline: `scenegis/develop@d255b6b74e`
- Related: ADR-0070、ADR-0062；SGP 增量：无
- Review: [self-review](../reviews/2026-10-16-horizon-style-scale.md)

## 已确认问题与边界

公开球面页中心朝天、下方仍有地表：23 块可见且已加载瓦片，参考距离 0.1 m，
style zoom 29.1013491488；118 个样式层全部超出 maxzoom，drawCommands 为 0。
`computeZoom` 未命中椭球时以 ECEF 原点最近点距离退到 near，错误地把裁面当成地表。

负责人确认参考 Cesium 地表距离计算修复。保留现有逐瓦片 SSE、source 层级、硬预算、
当前样式 visibility/filter/minzoom/maxzoom、地形/外部模型遮挡及已验收的注记原子交接。
不修改 SDK、上游文件、PASS、Shader、Worker 协议、公开 API 或生成器。

## 实现

仅修正 Globe cover 的全局比例参考，数据选级 `select` 不变。
命中时保留视轴椭球交点及距离；未命中时在 Cesium 椭球 scaled space 中求前向射线最近点，
通过 `Ellipsoid.scaleToGeodeticSurface` 投到真实椭球面，以相机到该地表点的距离计算比例。
相切极限两支收敛到同一个地表点；朝外时使用相机下方的地表，距离不再退到 near。
纬度 metric、CSS pixel 换算与 `_referenceDepth` 统一使用该参考；保持已有 1e-10 zoom 去噪。
不采用整数 tile level、时间平滑、历史帧锁定或截断 zoom 来遮盖错误。
复用 scratch 数值对象，不引入逐帧瓦片扫描、地形请求或 GPU 资源。

## 验证

1. 以原失败位置、朝天方向和 near=0.1 复现 zoom 越界；补充有限真实距离、near 无关性。
2. 固定相机位置连续跨真实椭球切线、当地水平线，在赤道/中纬度/高纬度验证
   zoom 和参考距离衔接；既有正常交点、绕目标稳定性及 SSE mixed cover 资格保持。
3. 实际 WebGL 下中心朝天时下方 fill/line 可见且可拾取；显式 zoom 隐藏继续有效。
4. 运行 Globe、Symbols 及相关动态样式 Specs，覆盖线宽上限、地形、外部模型遮挡。
   只运行相关 build、lint 和文档检查，不重复完整发布矩阵。
5. 保留用户相机，构建后在同一公开页复验并保存截图；记录有限 warm CPU 成本，
   由负责人完成视觉 gate。新问题单独记录，不混入已完成 checkpoint。

## 结果

运行时仅修改 `_SceneGISVectorGlobeCover.computeZoom`，`select` 和所有遮挡代码不变。
新增 5 项 Specs，连同 Globe、Symbols 与 dynamic rules 共 90 项通过，构建与 scoped
ESLint / Prettier 通过。公开页原视角参考距离 23.5028448768 m、zoom 21.2246575756，
23 块可见瓦片不变；241 帧跨地平线与恢复过程中无绘制归零，failedTiles / symbolFailures 为 0。
用户相机已恢复，2026-10-16 负责人确认视觉验收通过；技术自审与边界见 linked review。
形成独立本地 checkpoint，不推送。随后高级环境灰蒙感作为独立诊断。
