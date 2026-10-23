# 平面地形深度测试开关

- Plan type: standalone
- Status: completed
- Owner roles: Architecture / Execution
- Architecture review: confirmed
- Created / Updated: 2026-10-23
- Parent plan / Phase: None；复用已完成的 planar-world 协作区
- Discussion: None
- Review: [技术自审](../reviews/2026-10-23-terrain-depth-test.md)
- ADR: [ADR-0185](../../../Documentation/SceneGIS/Decisions/ADR-0185-planar-terrain-depth-test.md)
- SGP: SGP-0001（现有 primary-world 集成缝隙）

## 目标与源码事实

补齐可写布尔属性 `SceneGISPlanarWorld.depthTestAgainstTerrain`。默认 true 保留
现有平面画面；false 使用原生 terrain-classification 后清除主深度的机制，让普通对象
不被地形遮挡，继续保留对象之间的深度关系。该属性与原生 Globe 同名，但默认值不同。

Scene 目前仅按 Globe 计算 clearGlobeDepth；平面地表使用 Pass.GLOBE，贴地内容使用
Pass.TERRAIN_CLASSIFICATION。Deferred 已在 clear 前保留地形深度，单视锥复用该快照；
多视锥透明阶段的深度恢复只跳过 Globe group -3，需要同时识别 Planar group -5。
SceneGISPlanarWorld 是现有根导出；GLSL 沿用 Source/Shaders 生成链，不编辑生成物。

## 实现边界

1. owned World 增加默认 true 的属性及布尔校验，不增加 Viewer/constructor option。
2. Scene 保持原 Globe 分支；非 Globe world 仅在显式 false 且 show 时选择 clear。
   该可选结构能力不成为 SceneGISWorld 的必需成员。DepthPlane 仍只供 Globe 使用。
3. 延迟透明深度恢复同时识别两种地表 group；在跨视锥遮挡判断前剔除被关闭的地形深度。
4. 保持实际地形的材质、classification、深度快照、pickTerrain/getTerrainHeight 与生命周期。
   场景 pick 识别可见对象；pickPosition 延续已有深度拾取策略，不承诺穿透地形取得地下坐标。
   request-render 调用方请求帧。
5. 默认环境不强制重写平面开关；不借用 Globe 的深度所有权/DepthPlane，不增加 GPU 资源。
6. 实测确认原生 Billboard 有独立的地形纹理检查。owned DeferredAnnotations 的命令准备
   显式适配其 coarse-depth uniform，覆盖 render/pick/depth，缓存派生命令和 map；
   不修改 native BillboardCollection 或 caller 的 disableDepthTestDistance。
   多视锥注记的深度 guard 只跳过正 tag 的 Planar 地表，普通对象及负 tag 注记仍遮挡。

## 验证与退出

- 默认值、setter 和错误输入；真实 GPU 默认/false/恢复、地下对象及对象间遮挡。
- flat 和真实 heightmap；terrain classification、pick、pickPosition 与地形查询。
- 多视锥透明对象、恢复地形开关、资源复用/销毁及 Globe 回归。
- 完整 build、release build、build-ts/tsc；专项 Specs 和静态检查、SGP audit。
- 仅针对已复现的问题修改，最小充分证据后停止扩大检查。

## 结果

已实现并技术自审。专项 GPU dev/release 各 7/7，World 27/27、公共 World 27/27、
GroundBatch 21/21、Annotations 8/8；Globe 30/31，唯一旧云测试失败在原源码复现。
完整 build、build-release、build-ts、tsc 通过。两项 dev/release 浏览器开关对照通过，
已检查截图；命令/材质身份稳定、存储无增长、销毁与 GL error 检查通过。
详见 [review](../reviews/2026-10-23-terrain-depth-test.md)。

偏差均来自源码/实测：补齐 Billboard 的独立纹理检查和跨视锥 guard；原生单视锥
pickPosition 合并地形深度，因此不新增地下坐标穿透拾取语义。
没有新增上游文件或 SGP；没有编辑/提交生成物。2026-10-23 负责人确认视觉验收通过，
并要求在 scenegis/develop 形成独立本地提交；未要求推送。
