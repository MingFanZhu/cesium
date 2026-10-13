# Discussion: 多光源调度与容量

## Metadata

- Status: `resolved`
- Owner role: `architecture`
- Created / Updated: `2026-10-13`
- Parent: [P3 draft](../plans/2026-10-13-p3-many-light-and-shared-data.md)
- Baseline: P2 `b1c3a8a494`，ADR-0090 / ADR-0156

## Confirmed direction

负责人指出，延迟多光源不能继续沿用原前向的全局逐灯算法作为最终实现。当前 P2 确实仅
分离材质与光照，街区默认零局部灯。旧 Shader 的 16 灯循环只作为行为参考，不能计为
多光源优化成果。

复用的边界应是灯光 API、世界坐标、距离/锥角衰减、BRDF 和能量合成；光源上传、候选
选择与 GPU 遍历需要替换。优先考虑保守 tile 光源列表，深度 clustering 与 light volume
作为依赖场景/成本的备选，不在缺少实际证据时同时实现。

## Pending capacity and mixed receivers

既有公开容量为 16；提高容量必须同时处理透明 / Phong / 普通地表接收者，否则同一集合
将出现不同内容可见灯数不一致。建议保持调用形式，集中参数表与 tile 列表由内部管理；
超容量显式失败，不丢灯。具体数量、范围与资源预算待调查后请求负责人确认。

本轮未改变局部灯无阴影的既有边界，未增加 GI、体积散射或 glTF 灯节点导入。

## Measured baseline and source-backed implementation scope

P2 街区固定视图、1280×800、14:00 UTC、RTX 3060 Ti / Edge 155 / ANGLE D3D11、
TAA / AO / SSR 均开启。16 个屏幕网格位置均成功拾取到表面，灯向相机移出表面 1.5 米，
每灯 intensity 25；相同位置比较 range 6 与 80 米。三种状态交错测量各 6 帧，无 disjoint。

| 配置             | 屏幕光照 GPU 中位数 | 整帧计时中位数 |
| ---------------- | ------------------: | -------------: |
| 0 灯             |            0.161 ms |        19.3 ms |
| 16 灯 / range 6  |            0.273 ms |       115.0 ms |
| 16 灯 / range 80 |            0.364 ms |       110.5 ms |

整帧增加主要来自 CPU 提交。单灯、12 帧 CPU profile 中 `ShaderCache.getDerivedShaderProgram`
占约 1.06 秒采样时间，主要调用栈为 `SceneGISLocalLights.receiver` 经 `executeCommand`
和 `executeShadowMapCastCommands` 进入。原 helper 每次 receiver 都查派生程序；原生缓存以
`keyword + cachedShader.keyword` 构造包含 Shader source 的字符串键。不能将该开销解释为
灯光着色运算，更不能由 16 灯推断几百盏的速度。需在后续 owned receiver 中消除重复查询，
并审查颜色接收与 shadow caster 的资格边界；当前仅定位，未修改运行时。

源码确认原生 `Texture` / `PixelFormat` / `createUniform` 已支持 RGBA32F、RG32UI、R32UI
和 `UNSIGNED_INT_SAMPLER_2D`；可复用资源创建/上传，无须为灯表改 Renderer API。
拟采用参数表 + tile offset/count + 连续索引；先按 32 像素 tile、256 灯估算，1080p
所有灯覆盖全部 tile 时索引约 1.99 MiB，headers 约 15.9 KiB，参数约 16 KiB，另有
纹理行对齐与 CPU 副本。此为预算估算，不是实测占用；实际列表按保守覆盖生成，不能截断。

## Decision proposed to owner

- A（建议）：保留 `SceneGISLightCollection` / `PointLight` / `SpotLight` 调用形式；改为
  tile 列表与 GPU 参数表，首轮将集合容量从 16 扩至 256，透明和普通接收者共享同一数据。
  在同一参数表上保留私有逐灯参考用于等价性/成本对照，不增加长期公开渲染模式。
- B：先保持 16 灯，验证 tile 算法后再独立扩容。范围更小，但不能验证上百灯的目标收益。

负责人已选择 A。按 256 灯、共享 GPU 表和分块列表执行 P3a，先形成独立 checkpoint，
再开展屏幕数据复用。ADR-0157 / SGP-0047 记录协议和 caster 接点。

## Implementation evidence and refinement

三张独立参数/索引纹理在真实 clearcoat + 天空 + 局部反射探针组合中超过 16 个
fragment sampler，GPU Spec 已复现链接失败。实现改用单张 RGBA32UI，保存参数 float bits、
headers 与 packed uint 索引；数据精度与公开 API 不变，不提高 sampler 门槛。
全重叠时已实测额外索引读取开销，因此完整 tile 直接使用相同顺序的全局表；不截断或少算灯。

餐馆近景下 6 米灯范围高度重叠，不能标为稀疏场景；增加 3 米范围，保留 6/80 米的退化测量。
完整最终数据以 P3a review 为准，之前三纹理版本仅作为问题定位证据。
