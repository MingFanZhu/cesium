# Review: P3a 分块多光源资格

## Metadata

- Status: approved，技术与负责人视觉 gate 均通过
- Reviewer role: architecture，当前任务自审；未启用独立评审 Agent
- Target: P2 checkpoint `b1c3a8a494` 之后的 P3a
- Parent: [当前计划](../plans/2026-10-13-p3-many-light-and-shared-data.md)
- Decision: [ADR-0157](../../../Documentation/SceneGIS/Decisions/ADR-0157-tiled-local-lighting.md) / SGP-0047
- Created / Updated: 2026-10-13

## Findings and disposition

| ID         | Severity | Status                 | Owner         | Evidence and follow-up                                                                                                                                                                                                             |
| ---------- | -------- | ---------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WDR-P3A-01 | high     | fixed                  | execution     | 原局部灯 receiver 每 draw 查询大字符串 Shader cache，且进入 shadow caster。按源 ShaderProgram 身份缓存程序，Scene 显式排除 caster。热帧 Spec 确认局部派生缓存查询为 0；街道 16 灯整帧回到约 16–19 ms，原约 115 ms 的提交瓶颈消失。 |
| WDR-P3A-02 | high     | fixed                  | execution     | 三张独立数据纹理使 clearcoat + 天空 + 反射探针超过 16 sampler。合并成单张 RGBA32UI，参数保留 float bits；6 项探针 GPU Spec 包括 256 灯不同捕获相机的对照通过。                                                                     |
| WDR-P3A-03 | medium   | accepted for prototype | architecture  | 候选减少不足时索引读取比全局遍历更贵。3 米范围有收益，6 米密集重叠仍退化；全部灯的 tile 直接使用等价全局序列。不得用隐藏、截断、降低灯强度来冒充性能提升。后续只有实际需求时再评估更紧范围或深度 clustering。                      |
| WDR-P3A-04 | boundary | retained               | architecture  | 当前是 WebGL2 实验，新增 GPU 表不支持 WebGL1。局部阴影、体积散射、GI、任意 CustomShader 和 P2 未编码材质仍不在资格内。此阶段不表示可以迁入主线替换全部内容。                                                                       |
| WDR-P3A-05 | gate     | accepted               | project owner | 负责人于 2026-10-13 接受街道视觉结果，明确批准形成 P3a 提交并继续。P3b 待 checkpoint 后细化。                                                                                                                                      |

## Correctness and lifecycle

Chrome Headless 155，真实 WebGL，开启 `--webglValidation`：

- LightCollection **15/15**：Globe / Planar 大坐标，PBR / clearcoat、spot、Phong opaque /
  translucent、地表、SSR、阴影 / AO / 自发光独立及 Shader cache 复用。
- LightTiles **4/4**：256 点/聚光灯全像素对照，正交移动、非对称透视、近平面 / 相机内 /
  灯在相机后方，全部重叠无截断；纹理复用、grid 更新、容量增长替换、空/隐藏/销毁释放。
- DeferredLighting **9/9**：原有材质 / MASK / IBL / 遮挡 / 水面 / 深度 / AA 边界；
  混合普通与透明接收者的测试改为 256 灯，与原颜色路径和全局灯表对照。
- ReflectionProbe **6/6**：增加 256 局部灯的 cube 捕获/主相机恢复，全局表与 tile 结果一致。

Edge 155 / ANGLE D3D11 / RTX 3060 Ti，Bistro 多灯 E2E **1/1**：
16 灯 / 6 米，256 灯 / 3、6、80 米，全图 HDR 在 tiled 与 global list 间
本轮平均和最大误差均为 0，无非有限值。对照关闭 TAA 并重置 SSR；
成本/移动保留 TAA / AO / SSR。24 次相机移动后 TAA 与灯表有效，复用参数纹理，
Scene 销毁释放灯表，无 pageerror。夜景截图已查看；测试默认视觉灯强度 1，
成本对照固定 25，两个算法相同。不是用调低强度取得收益。

## Bounded performance evidence

1280×800、餐馆固定视图、2026-03-20 14:00 UTC、单采样、TAA / AO / SSR 开启。
每种配置编译后分别计时屏幕光照和整帧各 6 帧，使用
`EXT_disjoint_timer_query_webgl2`，无 disjoint。以下均为中位数；整帧短测存在 CPU 提交波动。
逐灯参考也用同一 GPU 表和 CPU prepare，隔离 GPU 遍历差异。

| 灯数 / range | 每块平均候选 | 屏幕光照：全局 → tiled | 整帧：全局 → tiled | tiled CPU prepare（含上传调用） |
| ------------ | -----------: | ---------------------: | -----------------: | ------------------------------: |
| 0            |            0 |               0.180 ms |           15.91 ms |                            0 ms |
| 16 / 6 m     |         12.5 |       0.400 → 0.457 ms |   16.88 → 15.95 ms |                         0.10 ms |
| 256 / 3 m    |         79.8 |       2.746 → 1.771 ms |   18.33 → 17.42 ms |                         0.65 ms |
| 256 / 6 m    |        195.0 |       3.490 → 4.345 ms |   18.27 → 19.49 ms |                         1.20 ms |
| 256 / 80 m   |        256.0 |       5.734 → 5.293 ms |   22.05 → 20.78 ms |                         0.85 ms |

3 米覆盖的屏幕光照减少约 **35.5%**，整帧约 **5%**；这不是全管线 35.5% 提速。
6 米高度重叠实际退化，不能标为“稀疏”。80 米所有候选均保留，并直接读取全局序列；
短测差异不能解释为剔除了灯。0 / 16 灯没有 GPU 分块优势，不承诺各数量普遍加速。

灯表在 3 米测试中约 544 KiB，6 米增长到约 1056 KiB；容量保留到空/隐藏/销毁，
因此后续 80 米仍报告 1056 KiB，不能按本帧实际索引数冒充显存回收。
首次全覆盖只需参数、headers 和一行索引存储；真实显存还包含原生材质、屏幕目标等。
灯表本身只增加一个 sampler，不增加 draw / framebuffer / 深度 readback。

## Delivery and ownership

运行时与测试复用既有构建链。新增模块与 GLSL 均为 SceneGIS owned。
上游只改 `packages/engine/Source/Scene/Scene.js`，**SGP-0047**：
shadow caster 显式传递执行类型，局部颜色接收派生跳过该类型。
原生 ShaderCache 未改；派生程序仍由其管理。未修改或提交生成文件。

完整 dev / release / build-ts / tsc 通过（类型生成保留既有 Cesium JSDoc 警告）。
改动 JS / HTML 的 ESLint、改动文件 Prettier、AgentDocs Markdownlint、
SGP 补丁审计和 git diff 检查通过；本轮 upstream-owned 文件数 1，生成物改动为 0。
完整 AgentDocs Prettier 的历史 416 个未改文件警告不属于本阶段，禁止顺带格式化。

## Owner reproduction

独立 `Test/Rendering/延迟光照原型.html?world=globe&lights=256`。
左下控制灯数 / 范围 / 强度 / 分块，右侧 Cesium UTC 时钟可调到 22:00。
切换分块应保持画面，移动时观察受光边界和透明/植被；灯固定世界坐标，
“布置到当前画面”才重新放置。候选统计表示保守列表数量，不代表精确命中灯数。
负责人于 2026-10-13 选择 A，技术与视觉 gate 均通过。当前架构任务确认 P3a completed，
形成独立本地 checkpoint；提交前不激活 P3b。
