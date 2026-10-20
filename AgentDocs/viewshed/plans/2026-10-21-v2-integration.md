# Phase Plan: V2 observer selection and integration

## Metadata

- Plan type: phase
- Status: completed
- Parent plan: [extension](2026-10-21-extension.md)
- Phase: V2
- Owner role: execution
- Architecture review: confirmed
- Architecture reviewer: current task self-review
- Created / Updated: 2026-10-21
- Related review: [V1](../reviews/2026-10-21-v1.md)
- ADR: 0176
- SGP: SGP-0065

## Objective

将 V1 (`04101ff1ea`) 接入公开定向分析、独立瓦片选取与显示合成。
覆盖显式来源中的 Model / 3D Tiles / S3M，以及可选的当前 World 地形。

## Non-goals

沿用 extension plan 的首轮边界；不将 resident-command capture 当成 streaming 完成。
不以主视图 tilesLoaded 作为观察点 ready，也不使用填充平面补齐未知地形。

## Entry conditions and current source facts

- V1 GPU / lifecycle gate 与本地 checkpoint 已完成。
- Planar Surface 的 render 每帧只执行一次；terrain.prepare 每调用一次会
  消耗两个任务启动 / promotion 的预算。应先合并需求再调用一次。
- Planar quadtree 的 tiles 是缓存，选取数组和保护集合可分离；
  tile.command 是主视图缓存，观察点必须拥有自己的 command state。
- Globe provider 的 addDrawCommandsForTile 复用 shader / geometry；
  独立命令追加到本帧已用槽之后可避免覆盖主命令。fill 不是可靠遮挡体。
- Globe tile load queue 在 endFrame 处理，LRU 保护必须包含观察点。
- Native 3D Tiles 的 updateForPass(SHADOW) 可复用遍历、请求和内容；
  SSE 的 drawingBuffer dimensions 需要显式 observer viewport。
- S3M 的 `_selected / _protected / _tilesLoaded` 为单视图状态，需分离 selection
  并在一次正常 update 中保护所有视图，避免 observer 之前发生 eviction。
- Model clipping planes 当前是 world-space inverse transpose；自动 uniforms
  提供观察点变换。IBL 相机矩阵不影响 discard。minimumPixelSize 会造成
  与主相机相关的真实顶点缩放，分析来源需明确拒绝这一显示尺寸模式。

## Detailed design

公开 `SceneGISViewshed` 继承原生 PostProcessStage，由绑定 Scene 的
postProcessStages 管理销毁，分析实例保存 World 身份。`analysisReady / status`
与原生 stage.ready 分开，后者只表示后处理本身可执行。
输入为观察点 position / direction / up、near / distance、水平和垂直视角、
resolution、显式 sources 和 terrain 开关。方向与距离均为 World 原始坐标。

Scene 在 main primitive update 前发布 enabled observer 列表，Planar / S3M
正常更新期间合并加载和缓存保护。主绘制完成后、后处理执行前捕获观察点，
之后恢复 FrameState 和 UniformState。共享主线性深度并在显示 stage 中比较，
不把分析颜色送入测光或高级环境。pending / error 保持原色，不能输出绿色结论。

Planar 复用 quadtree 算法但分离选取 workspace，共用 tile map / terrain runtime。
观察点 SSE 使用深度图像素数；主视图的拾取命令、地形查询 snapshot 不变。
Globe 以观察点 frustum / SSE 遍历共享 terrain hierarchy，使用原生 load queue
和 provider 命令生成窄 hook；不依赖主选择历史，不生成分析 fill，排除 skirts。
所有捕获使用每实例派生缓存，支持已加载几何动态变化。

## Affected paths

- Owned: SceneGISViewshed、viewshed private helpers / shader / Specs
- Owned: PlanarSurface / PlanarQuadtree / PlanarTerrain、SceneGISS3MLayer
- Upstream: Scene.js、GlobeSurfaceTileProvider.js、Cesium3DTile.js
- ADR-0176、SGP-0065、本文与 extension index

## Steps

1. World-bound stage、Scene prepare / capture / destroy 接点与重投影显示。
2. 显式 Model / primitive、3D Tiles 与 S3M 独立选取。
3. Planar 共享预算 / 几何与 Globe 共享加载 / 原生命令接入。
4. 准备 loading / error / destroy 回归，真实 GPU 双世界遮挡验证与 checkpoint。

## Validation

最小本地几何与 tile fixture 验证：观察点不变时移走主视图仍保留遮挡；
MASK / clipping / dynamic vertex / flatten；实际来源消失和改变后刷新；
loading 不着色；World 错用 fail-fast；hide / remove / scene destroy 释放。
Planar worker 预算与 main query snapshot、Globe main tile selection 和原始阴影
不得回归。公共 API / shader 完整 build、build-ts / tsc、release。

## Risks and dependencies

动态自定义 shader 的 bounds 仍须由来源维持；有限采样不能保证亚像素细墙。
观察点覆盖增加 tile residency / geometry draws；V3 记录整体性能和视觉结果。

## Completion criteria

所有来源具备明确覆盖状态；核心离屏遮挡与生命周期 GPU / Specs 通过，
自审无阻塞问题并形成独立 checkpoint。

## Deviations and results

Implemented with SGP-0065's three minimal upstream seams. Native base / skip
traversal does not fill pass.ready; coverage instead checks its SSE frontier.
Receiver-plane reciprocal depth addresses shallow-angle self-occlusion without
larger bias. Main-depth reconstruction removes TAA jitter. Failed coverage
reports an event and leaves the display unchanged.

11 Viewshed GPU tests, 9 S3M tests and 18 Quadtree tests pass. Surface / Shader
47/48 matches the previously recorded cross-frustum transparency failure.
Build / release / declarations / tsc pass. See [V2 review](../reviews/2026-10-21-v2.md).
Checkpoint required before V3 real-data and visual qualification.
