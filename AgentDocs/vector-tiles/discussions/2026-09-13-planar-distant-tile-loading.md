# Discussion: 平面浅俯角的远景瓦片加载

## Metadata

- Type: `discussion`
- Status: `resolved`，负责人已批准低角度专用策略，正式决定见 ADR-0066
- Author role: `architecture`，当前 Agent
- Created / Updated: `2026-09-13`
- Parent: [Vector Tiles](../plans/2026-09-12-vector-tiles-extension.md)
- Current phase: [V3C1A](../plans/2026-09-13-v3c1a-tilted-distance.md)
- Review: [V5B-R13](../reviews/2026-09-13-v5b-line-symbol-review.md)
- Related: [Planar World](../../planar-world/README.md)、[Planar Terrain](../../planar-terrain/README.md)
- ADR: [ADR-0064](../../../Documentation/SceneGIS/Decisions/ADR-0064-vector-perspective-lod.md)、
  [ADR-0009](../../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)
- SGP: None，当前无上游改动

## Resolution

负责人已批准保留粗远景的实现，并明确俯视拉远不能触发。V5B checkpoint 为 `bb007b3518`。
采用 World 可写距离属性，默认 Infinity，仅低于 20° 的透视启用，10° 以下完全采用距离，
中间逐渐放宽；三维 closed tile bounds 判断，source / ready cover / 依赖协议保持。
公开页显式设置 100000 米，不增加 Viewer 构造字段；当前没有自动距离推导。
这些选择及先前 open decisions 的处置已提升到
[ADR-0066](../../../Documentation/SceneGIS/Decisions/ADR-0066-planar-tilted-tile-distance.md)。
下文保留最初审计与方案权衡，不再表示当前未实现状态。

## Problem and confirmed direction

负责人要求保留能看见地平线的平面浅俯角能力，在选取阶段限制远处瓦片，
同时使影像和地形受益。不能用相机最小俯角、全场景 Camera far 或只隐藏标注解决加载开销。
公开页已采用 Viewer 默认持续渲染和原生 FPS 面板，这与瓦片选取策略是两项独立工作。

当前地形、影像和 MVT 并非由同一个 provider / cache 调度。应共享空间判断与范围契约，
保留各自的加载、就绪和渲染覆盖协议。

## Source facts

- `_SceneGISPlanarQuadtree.selectTiles` 以 frustum、maximumLevel 和 SSE 递归细分。
  Perspective SSE 使用相机到 tile 三维包围盒的最近距离；没有独立远景加载范围。
  `tileCacheSize` 约束可淘汰的残留缓存，不限制当前受保护的 desired / load / render 集合。
- `_SceneGISPlanarSurface.render` 先 select，再构造 terrain load dependencies，
  解析 ready render cover，最后对 render tiles 准备 imagery。因此在最终 draw 阶段剔除太晚。
- `_SceneGISVectorTileCover.selectAdaptive` 复用 planar SSE，按优先级在 64 块预算内形成
  mixed LOD；它不是强制统一层级，但仍会覆盖很大的可见远景。
- Terrain load 集合包含 desired、祖先和细分节点的四个直接子节点。
  `SceneGISPlanarTerrain.prepare` 仅对 desired 及祖先推进 direct 请求；额外兄弟准备 fallback，
  不能把 load 记录数当作网络请求数。四个子节点都有可渲染内容后才撤下父节点。
- 当前 symbol 的四倍中心地面深度规则仅限制候选，不影响上述 desired / request 集合。
  视轴接近平行地面时，中心交点距离会趋于无穷，不能直接拿它定义新的有限加载范围。

实际应用浏览器独立诊断页，Berlin Bright、1308×900 CSS、DPR 1、5°、
style zoom 12.049935656442358：

| 项目                                   | 观察值    |
| -------------------------------------- | --------- |
| MVT visible / rendered                 | 64 / 64   |
| 地表 selected / render                 | 219 / 219 |
| 地表 visited / load dependency records | 473 / 473 |
| 地表 resident                          | 493       |
| MVT 累计 requests / pending            | 68 / 0    |
| 标注 candidates / placed               | 333 / 87  |

间隔数分钟复读，累计请求仍为 68，静止可收敛；这一证据不否认移动时的加载抖动，
也不能据此认定静止无限请求。后续应比较同一路径的请求增长、选择开销和处理队列。

## Proposed boundary

建议采用“近处按原 SSE，远处保留粗覆盖并限制细分”。相机仍可自由倾斜，
三维对象仍使用原视锥；限制的是地图细节加载，不是世界的可见距离。

1. 范围由 Planar World 层表达，MVT 和底层 surface 使用同一空间判断。
   在生成 desired leaves 之前决定是否继续细分，避免无效请求、解码、Worker 和 GPU 上传。
2. 对 tile 包围体做保守判断，跨越边界的 tile 继续正常选层。
   Terrain 使用声明的高度区间，不能只按 tile 中心或 Z=0 裁掉远山。
3. 范围外停止追求当前细节，保留有界的粗远景 cover。
   不把所有已经加载的远景永久固定，也不允许无限新增粗覆盖集合。
   父子替换继续遵守无洞、无重叠规则；依赖瓦片可以超出细节范围。
4. 与“直接不选范围外地表”相比，粗覆盖避免突兀的地平线缺口，但需要少量背景数据。
   硬裁切可以进一步减小负载，画面会出现可见边界；已向负责人询问这一视觉取舍。

距离以平面坐标系的线性单位解释。首轮可采用明确的有限距离配置建立可验证契约，
后续自动范围仍需受有限上限约束；不先硬编码固定 XYZ level、屏幕顶部像素带，
也不把接近平行时发散的视轴地面交点当作唯一尺度。
既有未启用限制的调用方应保持行为，公开页先显式启用，再依据实际三维场景讨论默认策略。

## Open decisions and next implementation

- 远处保留粗覆盖还是完全裁掉，当前推荐前者；明确粗覆盖的工作量上限。
- 明确距离参考、单位、默认值与是否暴露自动范围；必须覆盖近水平、相机进入地形高度区间、
  正交和无地面交点，不能把未定义情况静默退回无限加载。
- MVT source minimumLevel 高于可用粗层级时，明确背景策略；不能扫描全世界 minimumLevel，
  也不能假设服务提供未声明的低层级数据。
- 重新选取后未需要的网络/Worker 任务如何取消或不再接纳结果；保留必要父节点和地形兄弟依赖。
- 这将影响 World 配置和跨扩展性能契约。范围确定后提升 ADR，更新 V3C1 的阶段范围，
  在 V5B 独立 checkpoint 后细化 phase plan；不在 symbol 私有实现里藏入共享加载策略。

实现验证限定为：选择器 Specs 覆盖范围边界和高程；真实 Scene 的父子替换、拾取与释放；
`Test/**` 本地地形/影像/MVT 同视角验收；5° 与接近水平的固定移动轨迹比较
desired / load / request 数、CPU、队列和资源。要求静止请求收敛、移动工作量有界、
近处细节保持，远景覆盖质量由实际画面验收。不能只凭 FPS 或最终命令数宣布加载问题解决。
