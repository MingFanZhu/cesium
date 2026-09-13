# ADR-0066: 平面低角度视图的瓦片细节距离

- Status: Accepted
- Date: 2026-09-13
- Scope: Planar World、surface imagery / terrain、vector tile selection
- SGP: None
- Related: [ADR-0009](ADR-0009-planar-terrain-continuous-lod-and-cache.md)、
  [ADR-0064](ADR-0064-vector-perspective-lod.md)

## Context

平面透视相机接近水平时可见范围很大，原 frustum / SSE 选择仍遍历和准备大量远景。
隐藏标注不能减少瓦片请求；收紧相机俯角或全场景 far 会限制三维能力。
负责人要求在选择阶段限制远景，并明确俯视拉远必须保持原行为。

## Decision

`SceneGISPlanarWorld.maximumTiltedTileDistance` 是可写的地图细节距离，默认 Infinity。
仅接受正有限 number 或正 Infinity，单位为平面米；默认保持既有选择。
它不是 Camera far、最大可见距离、source maximumLevel 或严格网络请求半径。
首轮不增加 Viewer 构造字段；应用在取得 World 后设置该属性。

仅对透视相机启用：视轴与水平面夹角绝对值达到 20° 时完全旁路；
夹角不超过 10° 时使用设置距离 D。中间角度令
`t = (sin(20°) - abs(directionWC.z)) / (sin(20°) - sin(10°))`，
有效距离为 `D / (t*t*(3-2*t))`。该过渡只放宽范围，不修改相机或 style zoom。
正交、俯视及高空俯视保持原 frustum / SSE；水平视轴仍得到有限的 D。

选择器计算相机到 tile 三维 closed bounds 的最近距离。超过有效距离时停止细分并保留当前
tile 为粗覆盖，距离相等或包围体跨界时仍按原 SSE。Terrain 的选择包围体包含保守高度区间，
不能用 tile center 或零高程替代。此规则在 desired leaves 产生时执行，早于请求与网格生成。

Planar surface 和独立 MVT cover 共享判定，继续保留各自 source、cache 和 ready render cover。
Terrain 的祖先和四兄弟 fallback 依赖保持，imagery 仍绑定 actual render cover。
MVT 仍遵循 minimumLevel 与 maximumVisibleTiles；不可凭空请求缺失粗层或枚举超预算全世界。
未就绪时沿用既有 resident fallback，不能制造新 retry / settling frame 或永久保护历史远景。

## Consequences and qualification

粗覆盖保持地平面连续，远处地图和地形细节会降低；本规则不保证任意 provider 的固定请求数，
但会减少低角度的 refinement 和后续工作。配置过小可以使大部分地图只保留粗层，
应用应按自己的数据尺度设置；公开 3857 页首轮采用 100000 米。

无 Shader、Worker、上游文件或资源类型变化；公共属性必须通过完整构建与类型资格。
测试验证 angle gate、不同高度俯视一致、DPR、三维 bounds、父子覆盖、真实请求/拾取与生命周期。
实际低角度画面和交互测量是性能与质量证据；具体阶段见
[V3C1A](../../../AgentDocs/vector-tiles/plans/2026-09-13-v3c1a-tilted-distance.md)。
