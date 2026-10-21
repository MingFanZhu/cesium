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
