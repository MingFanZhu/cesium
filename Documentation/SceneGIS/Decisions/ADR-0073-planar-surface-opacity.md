# ADR-0073：平面地表颜色透明与独立深度

- Status: accepted；2026-10-14 WebGL deferred amendment supersedes the color-only decision below
- Date: 2026-09-14
- SGP: SGP-0046（2026-10-15 透明地图阶段 hook）；其余为 SceneGIS-owned 实现
- Related: [ADR-0072](ADR-0072-vector-surface-transparency.md)

## Decision

### 2026-10-15 transparent vector amendment

负责人另行批准透明 Planar 与可见地图共存时的深度资源与提交预算，见
[讨论](../../../AgentDocs/webgl-deferred-renderer/discussions/2026-10-14-planar-vector-transparent-depth.md)。
按需增加一张 DEPTH24_STENCIL8，整个视图捕获最近地形表面；每个可见瓦片只增加
一次无材质、无光照深度提交，低于批准的每瓦片每视锥一次上限。拾取复用同一目标。
地图颜色使用与不透明地图互斥的已批准 RGBA16F，1280 × 800 合计 11.71875 MiB。
在既有透明地形提交中合成最近地表上的有序地图颜色，其他山坡不重复叠加地图；
World opacity=0 只移除地形自身颜色，不移除独立的地图颜色。地图、普通几何和
屏幕光照不增加提交。裁剪、越过地形边界的标记、拾取与 TAA 仍遵循原有契约。
Scene 通过 SGP-0046 显式调度 owned helper；无新公共 API。本文下方 P4d 的
“零 opacity discard”只适用于地形自身颜色，不再排除本增量的地图合成。

### 2026-10-14 WebGL deferred amendment

负责人在 P4d 视觉验收后明确要求真正透明，并确认不透明地表使用延迟受光，半透明
地表使用现有 OIT 专用受光通道。见 [ADR-0161](ADR-0161-unified-opaque-deferred-direction.md)
及 [决策记录](../../../AgentDocs/webgl-deferred-renderer/discussions/2026-10-14-planar-transparency.md)。

`opacity=1` 保持 Pass.GLOBE 与不透明深度；`opacity<1` 的原 tile command 转为
Pass.TRANSLUCENT，保留 depth test、关闭颜色绘制的 depth write、输出真实 alpha。
地表后方对象和重叠山坡参与原生 weighted OIT；前方不透明对象继续遮挡地表。
OIT 关闭或不可用时沿用原生排序透明能力，不保证相交透明面的精确顺序。
基础/物理/局部受光、阴影与天气在透明专用 Shader 中求值；不透明材质捕获仍提前
返回并在屏幕阶段受光。这属于透明配套通道，不是完整不透明前向模式。

零 opacity 在 Shader 中 discard，不产生颜色、深度或阴影遮挡；terrain LOD、
影像准备、height/ray 查询仍正常。无 feature ID 的透明地表不重放到普通 ID pick，
避免覆盖可见后方对象的 ID。`Scene.pickPosition` 默认返回不透明场景深度，开启
`pickTranslucentDepth` 后可重放非零透明地表深度。显式 World 地形查询独立于 opacity。
公共值仍在 normal render 发布，辅助 depth replay 不提前发布修改。

删除旧背景快照 helper、颜色复制、sampler 和资源，不增加独立透明材质附件。
复用原生 OIT 已有目标；移除旧快照可少驻留 8 bytes/pixel 的 RGBA16F（当前线性
存储 profile）。不透明/透明切换复用 tile command、VA 与内容纹理，更新 Shader、
pass、render state 及失效的派生命令。

以下保留原实现决定作为历史，仅“背景混色并保留遮挡深度”的部分由本修订取代。

### Original color-only decision

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
