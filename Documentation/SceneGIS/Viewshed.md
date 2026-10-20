# 定向可视域（实验 API）

`SceneGISViewshed` 显式绑定一个 Scene 与当前 World，作为原生
`PostProcessStage` 加入 `scene.postProcessStages`。移除时由 collection 销毁，
不销毁借用的遮挡模型、瓦片或 World。

```js
const analysis = scene.postProcessStages.add(
  new Cesium.SceneGISViewshed({
    scene,
    world: scene.world,
    position,
    direction,
    up,
    distance: 1500,
    horizontalAngle: Cesium.Math.toRadians(100),
    verticalAngle: Cesium.Math.toRadians(70),
    resolution: 1024,
    sources: [tileset],
    terrain: true,
  }),
);
analysis.errorEvent.addEventListener((error) => console.error(error));
analysis.setView({ position: nextPosition, direction, up });
// Borrowed source geometry remains alive.
scene.postProcessStages.remove(analysis);
```

Globe 的 `position / direction / up` 使用 ECEF；平面 World 使用当前世界的
米制 XYZ，无隐式投影。`setView` 每次提供完整姿态；未提供的标量沿用原值。
分析视角独立于主相机，不会改变相机跟随、定位或太阳阴影设置。

## 数据与状态

- `sources` 支持同一 Scene 中的 Model、Cesium3DTileset、SceneGISS3MLayer、
  Primitive 和 SceneGISPlanarPrimitive。所有来源必须先加入 `scene.primitives`。
- World 的不透明地表可选；排除裙边、填充占位面、透明介质、注记和分类。
  Globe / Planar 地形及瓦片按观察点选级、请求和保护，复用已加载内容。
- `analysisReady` 表示观察点当前覆盖已齐；原生 `ready` 只表示 stage 资源就绪。
  `status` 为 `loading / ready / error / disabled`。未齐或失败时保留原色，
  不依据缺失数据输出绿色结论。`error / errorEvent` 提供失败原因。
- `statistics.drawCalls` 为本帧观察点绘制数；`captureMilliseconds` 是
  CPU 选取与提交时间，不是 GPU 执行时间。停用分析不继续请求和捕获。

## 精度与支持边界

近裁面默认为 0.5 米，比较容差默认为 0.1 米。分辨率与源 LOD 决定边界和
薄遮挡物的精度；粗糙倾斜摄影在低视线下仍可能有离散采样噪点，
不能代替精确几何通视、面积统计或离线结果。源的位移 /
CustomShader 必须维护正确包围体；已有 `SceneGISModelFlatten` 的 bounds
扩展可以复用。多实例资源隔离，但首轮验收以单个定向观察点为主。

首轮为 WebGL2 / SCENE3D，不支持 VR、冻结 3D Tiles 遍历、
`minimumPixelSize` 非零的相机缩放模型、360 度及多观察点布尔运算。
分析色在显示阶段叠加，不进入测光；调用方后续添加的后处理仍按其顺序处理。

## 验收入口

根开发服务器运行后打开 `Test/可视域分析.html`，支持 `world=planar` /
`world=globe`。默认本地街区，黄色点为观察点，可调整姿态、范围、分辨率和
遮挡源显隐。可选本地 AGI HQ 3D Tiles、官方 S3M 精模 / 实例化。
S3M 倾斜选项需要先执行 `node scripts/scenegis/fetch-s3m-sample.mjs`；
数据缺失明确报错，不自动替换。

架构与跟踪：[ADR-0176](Decisions/ADR-0176-observer-viewshed.md)、
[扩展计划](../../AgentDocs/viewshed/plans/2026-10-21-extension.md)。
