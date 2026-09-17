# ADR-0069：平面矢量的直接贴地后端

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Plan: [V4A](../../../AgentDocs/vector-tiles/plans/2026-09-13-v4a-planar-terrain.md)
- Related: [ADR-0059](ADR-0059-planar-vector-tile-batch-renderer.md)、[ADR-0067](ADR-0067-vector-worker-preparation.md)、[ADR-0023](ADR-0023-planar-depth-stencil-ground-rendering.md)
- SGP: None

负责人要求真实地形与矢量共存，同时保留零高程快速路径。共享 stencil 的地图合批已在 V2
被否定；每要素 native GroundPrimitive 也无法满足现有地图命令预算。

## Decision

SceneGISVectorTileLayer 按 World 是否有 terrainProvider 自动选择 flat 或 ground。
二者共享 MVT 解码、style、三角化、Worker、缓存和瓦片覆盖。ground 要求 WebGL2、float
texture 与地表深度纹理；不满足时明确报错，不静默切换颜色 RTT 或主线程地形裁剪。

fill/line 使用已有三角化作为严格要素归属，Worker 生成几何数值表，GPU 批量实例化垂直
三角凸体。片元从 surface depth 重建 tile-local XY，以 barycentric 坐标恢复颜色、线型
和 fringe coverage。顶点动态膨胀沿用 flat 的米/像素契约。几何数值纹理不保存地图颜色。
凸体覆盖 provider 声明的全局高度包络；地形 LOD 不使矢量几何失效。

实现细化：Scene 的 primitives 更新先于 World.render。command 的保守视锥 bounds 使用
provider 全局包络；执行时的高度 uniform 则读取 World.render 刚发布的 cover，按矢量 tile
收紧到实际 terrain/skirt 高度，并含待就绪零高程平面。这避免全球 -450～8700 米凸体
在普通街区产生大量无效片元；每个 tile/frame 只计算一次，不改变绘制拓扑。

ground 沿用 TERRAIN_CLASSIFICATION，surface 保持原有颜色/深度/地形生命周期。
front-face culling 和半开三角边选取单次贡献，地表 frustum 与 tile region 共同限定覆盖；
不使用任意 Z 偏移解决层序。feature pick table 由主线程分配 Context pick IDs，继续使用
Cesium 派生 pick command，pickPosition 仍来自地形。

圆点与文字采用独立 terrain anchor：采样已发布地表，不额外驱动 terrain 请求；地表发布
变化使 anchor/必要字形位置失效。屏幕朝向保持屏幕尺寸，地图朝向角点跟随地形，遮挡按
anchor 地表深度判定。此契约不等于连续曲面字形、Globe 或完整 MapLibre terrain 资格。
World.enableLighting 启用时，地图颜色使用 depth 重建法线与环境光/漫反射；高级材质、
阴影和环境反射未纳入本阶段。style 比例继续使用 ADR-0064 的 Z=0 参考面，完全朝离参考面
的视轴尚无三维 style 比例契约，不以放开 provider 拒绝宣称解决该既有边界。

模式切换销毁旧 GPU 与 placement，保留已加载源数据；异步旧结果不得回写新模式。
provider 到 provider 的切换复用 ground 几何，仅高度包络和 anchor 改变。

## Consequences and delivery

默认零高程无需地形采样和凸体成本；真实地形增加 GPU 顶点/片元工作量和数值表内存。
新增文件沿 SceneGIS Core → Renderer → Scene 分层，GLSL/Worker 使用既有构建发布入口。
验证地形色彩、alpha、孔洞、线型、pick/深度、LOD/provider 切换、资源与性能；不新增上游 seam。
