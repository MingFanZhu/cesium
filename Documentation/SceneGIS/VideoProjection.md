# 视频投射

`SceneGISVideoProjection` 是实验 API，加入 `scene.postProcessStages` 使用。
球面位置为 ECEF，平面为当前 World 米制 XYZ；不会自动投影。必须绑定创建时的 Scene / World。

```js
const projection = scene.postProcessStages.add(
  new Cesium.SceneGISVideoProjection({
    scene,
    world: scene.world,
    video, // caller-owned HTMLVideoElement
    position,
    direction,
    up,
    sources: [tileset],
    terrain: true,
    distance: 2000,
    horizontalAngle: Cesium.Math.toRadians(60),
    verticalAngle: Cesium.Math.toRadians(40),
    resolution: 1024,
    opacity: 1,
    showFrustum: true,
  }),
);
projection.setView({ position: nextPosition, direction, up });
projection.opacity = 0.7;
projection.video = anotherVideo;
scene.postProcessStages.remove(projection);
```

## 几何、遮挡和画幅

`sources` 是显式遮挡集合，支持 Model、Cesium3DTileset、SceneGISS3MLayer、Primitive、
SceneGISPlanarPrimitive，须已加入同一 Scene。接收位置来自主画面的不透明深度，sources
不是接收对象过滤器。地形可独立开关。观察点独立选级与请求；不会只捕获主相机可见数据。
每实例有自己的深度图，不占用 `scene.shadowMap`；可与可视域和太阳阴影同时存在。

`distance` 是最大径向距离，near 与水平 / 垂直 FOV 决定投射几何。
`resolution` 是方形深度纹理尺寸，与媒体尺寸独立。视频按比例完整容纳在 FOV 矩形中，
两侧或上下留空处保持场景颜色。默认画面上方对应投射相机 up；`flipY` 可额外上下翻转。

这是显示阶段 SDR 叠加，视频不参与环境光照、曝光和 tone mapping，黑色也是内容，
alpha 保持目标画面原值。阶段按 postProcessStages 顺序叠加。不是物理投影灯。
透明表面不作为接收面或遮挡体；因为叠加发生在透明合成之后，不透明接收面像素上的
透明前景也可能被覆盖。首版不支持玻璃 / 水面透射和透明前景正确重合成。
薄物体、倾斜摄影噪点和有限深度精度可能影响边缘；不要用过大 depthBias 掩盖误差。

## 媒体与生命周期

浏览器须支持 WebGL2、`requestVideoFrameCallback`、`cancelVideoFrameCallback`；Scene
须为 SCENE3D。视频须允许 WebGL 读取；跨域视频由调用方配置 CORS。自动播放限制、播放 /
暂停、音频、seek、URL / srcObject、流协议由调用方管理。没有内置播放器或隐式网络重试。

新视频帧通知只标记 dirty 并 requestRender；上传发生在实际渲染中。同一静止帧不按显示
刷新率重复上传。禁用时取消帧通知，保留资源便于恢复；销毁时移除事件和回调并释放纹理，
不会暂停借用 video、修改其 src/srcObject 或停止 MediaStream tracks。
视频暂停不等于遮挡暂停：只要 Scene 渲染，动态模型和地形的观察深度继续更新。

- `videoReady`：当前源的有效帧已上传；seek / reload / 换源使其失效。
- `analysisReady`：本次观察点选级覆盖完整。
- `projectionReady`：以上两者均就绪且 enabled。
- `status`：disabled、error、loading-video、loading-coverage、ready。
- `error` / `errorEvent`：媒体或捕获错误；媒体错误保持到显式换源或 reload。
- 继承的 `ready`：原生后处理资源就绪，与内容覆盖不同。
- `statistics`：最近深度 drawCalls、captureMilliseconds，以及累计 videoUploads /
  videoUploadBytes 和最近 videoUploadMilliseconds；时间为 CPU 提交开销，不是 GPU 完成时间。

缺媒体或覆盖时保留原画面。每个实例的开销包含独立深度捕获和新视频帧上传，暂不共享
同位姿捕获，也不缓存可能已经变化的动态遮挡。SDK 集成和投影标定另行安排。

设计见 [ADR-0177](Decisions/ADR-0177-video-projection.md)，验收入口见 `Test/视频投射.html`。

## 自有分段高斯

传入非空 `gaussianTargets` 可投射到自有的 `SceneGISGaussianSegmentedPrimitive`。
它不支持 Cesium 原生 GaussianSplatPrimitive。目标必须已经加入同一 Scene，可在嵌套
PrimitiveCollection 内；投射只借用目标，不负责挂载或销毁。

```js
const projection = scene.postProcessStages.add(
  new SceneGIS.SceneGISVideoProjection({
    scene,
    world: scene.world,
    video,
    position,
    direction,
    up,
    gaussianTargets: [splats],
    sources: [buildingTileset], // Mesh occluders; targets also occlude one another.
    terrain: true,
    gaussianAlphaThreshold: 0.3,
    resolution: 1024,
    opacity: 1,
  }),
);
projection.enabled = false; // Requests a redraw; borrowed media is not paused.
scene.postProcessStages.remove(projection);
```

- `gaussianTargets`：创建时固定、只读的目标数组，默认空。非空时仅向这些高斯投射，
  后处理不再覆盖不透明表面；需要两类接收者时创建独立实例。先移除投射，再移除或销毁目标。
- `gaussianAlphaThreshold`：创建时固定的单个高斯片元透明度阈值，默认 `0.3`，范围 `(0,1]`。
  达到阈值的片元写入投影相机的近似遮挡深度，不改变正常显示透明度。
- 同一目标最多同时接收四路启用的投射，按 postProcessStages 集合顺序混合；超出会明确报错。
  `opacity`、`flipY`、媒体替换及 `setView` 沿用现有接口。

显示相机与各投影相机共同驱动同一份 Active Cut；投影深度分辨率决定其像素误差尺度。
原数据、Worker 排序与 atlas 不复制，加载和选级仍受原预算约束。投影视角变化或目标变换后，
完整覆盖重新就绪之前保留高斯原色；`ready` 不能替代 `projectionReady`。

片元接收位置采用三维 Gaussian 沿显示射线的最大密度点。协方差归一化后加入相对 `1e-6`
对角方差以稳定近退化形状的求逆，不改变显示形状或 alpha。高斯遮挡是单片元阈值近似，
不是不透明网格或累积透射求解；稀疏、低透明度数据可能漏光，有限 LOD 和深度尺寸也限制边缘精度。
视频在高斯捕获 RGB 中混合，之后与高斯一起参与场景曝光和显示变换；不会修改 SH，
也不进行 PBR 重光照。这与普通路径在显示阶段叠加 SDR 视频的颜色契约不同。

普通鼠标导航需要应用显式设置 `scene.pickTranslucentDepth=true`；视频投影深度不会
自动接入显示相机的 `pickPosition`。球面和平面都使用原生透明深度拾取，视频启停保持
相同的高斯导航深度。配置、精度与成本见[高斯导航深度](GaussianSplats.md#相机导航与深度拾取)。

每个投射仍拥有一张视频纹理及一份独立投影深度；1024² 深度约 4 MiB，RGBA 视频约
`宽 × 高 × 4` 字节。每个可见目标增加一次遮挡绘制，接收视频不额外重绘高斯。
每个曾启用投射的目标最多缓存接收 / 深度两个 Shader 变体，在目标销毁时释放；
移除投射立即释放其深度和视频资源。更多视角可能使现有 atlas 驻留更多数据，但不扩大预算。
目标 statistics 中的 videoProjectorCount、videoShaderPrograms 可用于诊断；投射 drawCalls
包含网格、地形和高斯捕获，captureMilliseconds 是 CPU 提交时间。

设计与边界见 [ADR-0208](Decisions/ADR-0208-gaussian-video-projection.md)。

### 可复现示例

运行 `node scripts/scenegis/create-gaussian-video-demo.mjs`，再打开
`Test/Rendering/高斯视频投射.html?world=planar` 或 `?world=globe`。
示例使用本地生成的 8,531 个高斯与校准视频流，默认暂停；可播放、翻转、调整透明度、
选择本地视频文件，并切换网格遮挡。点击“进入挡板后方”可验证显示相机看不到的高斯仍能挡光。
阈值改为 1 时，本例所有单片元 opacity 都低于阈值，因此后墙会重新接收视频；
这用于展示阈值近似的实际含义。切换阈值会重建投射实例，目标图元和图集保持原所有权。

自动化：执行 `npm start -- --port 8096` 启动根开发服务器，再执行
`npx playwright test -c Test/VideoProjection/playwright.gaussian.config.mjs`。
示例由页面管理视频、定时器和目标销毁；调用方应先移除投射，再销毁目标或 Scene。

一次有边界的暖态测量：Windows 10 / Chrome 156，RTX 3060 Ti / ANGLE D3D11，
1280×800，8,531 个高斯，512×320 暂停视频，1024² 投影深度。
page atlas 为 16 MiB，视频纹理 0.625 MiB，深度约 4 MiB，缓存两个辅助 Shader 变体。
每帧捕获 1 次绘制；一次 CPU 捕获提交 0.40 ms，最近视频上传提交 0.70 ms。
16 次有效 GPU timer 样本的整帧中位数为 2.42 ms、P95 为 3.36 ms。
这些不是投射的独立增量耗时，也不包含所有主场景资源的显存总量，不能推断百万级资产性能。
