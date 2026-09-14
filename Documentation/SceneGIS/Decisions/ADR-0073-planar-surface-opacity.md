# ADR-0073：平面地表颜色透明与独立深度

- Status: accepted，G3 qualification pending
- Date: 2026-09-14
- SGP: None；SceneGIS-owned 实现
- Related: [ADR-0072](ADR-0072-vector-surface-transparency.md)

## Decision

SceneGISPlanarWorld 增加 opacity，默认 1，有限 0..1。该值控制 baseColor、影像、Material 和基础光照合成后的
地表颜色；不改变各 imagery alpha，也不乘独立 VectorTileLayer.opacity。baseColor 继续要求 opaque Color。
World 属性在下次正常 render 发布，pick/depth replay 使用已发布状态。

所有 opacity 保持单次 Pass.GLOBE 几何绘制并写入原有深度。透明模式利用已有 World.renderEnvironment 接口，
在背景完成、第一组 surface commands 尚未执行时，保存背景颜色快照。地表片元输出
`mix(background, composedSurfaceColor, opacity)`，保持原生深度测试与颜色覆盖。
零 alpha 也写回背景及地形深度，从而移除之前远视锥绘制的隐藏地表/对象；不开放地下或背面内容。
native globeDepth copy、classification、普通地表上方对象和 log-depth 时序保持。

初始逐 frustum 深度预绘制加 blending 已在 multi-frustum 山地像素测试中证伪：半透明红色 128→192，
不仅是 near overlap，也包括不同视锥中的前后山坡。按原始 near 裁剪仍不能消除隐藏山坡叠色。
背景快照使同一像素的 surface 合成不依赖之前的地表颜色，原有 depth test 决定最后的当前可见面。

背景由 owned FramebufferManager 管理，每次正常 render 用 WebGL 2 color blit 复制一次，支持原生 MSAA resolve，
尺寸与 HDR datatype 跟随场景，借用 framebuffer binding 成对恢复。默认 opacity=1 不分配或复制背景。
只有透明 Shader variant 额外使用一个 sampler；正常变体、原有 sampler 容量与命令数不变。
不新增 Pass、Worker 或地图颜色 RTT；纹理不包含地形、影像、矢量、标注或普通对象的预绘制结果。
首次透明创建 Shader variant 与背景资源，之后 opacity 数值变化不重新解码或上传几何。缓存随 World 释放。

## Boundary

这属于地表颜色透明，几何深度仍作为贴地与遮挡依据。资格限上方相机的当前可见地表，支持零高程和真实地形。
不会透视地下对象或背后山坡。高级环境的透明深度/大气合成不由本决定自动获得资格。
透明模式要求 WebGL 2，增加一次屏幕背景复制与一个纹理采样；各 opacity 均只需一次地表几何绘制。
多视锥山坡遮挡、首次 Shader variant 和背景资源的生命周期与热路径成本必须验证。

## Verification

API/default、地表/矢量/影像独立 alpha、山峰重叠、linear/log depth、pick/depth 快照、资源复用/销毁由 Specs 验证。
页面与实际发布入口覆盖真实地形和标注；视觉与有界 CPU 证据不能代替负责人验收或宣称所有设备稳定 60 FPS。
