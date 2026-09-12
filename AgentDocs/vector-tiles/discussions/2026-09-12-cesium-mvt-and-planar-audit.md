# Discussion: Cesium MVT 与平面能力审计

## Metadata

- Status: `resolved`（初始源码审计完成，产品选择另见 open discussion）
- Owner role: `architecture`
- Created: `2026-09-12`
- Updated: `2026-09-12`
- Related plan: [Extension plan](../plans/2026-09-12-vector-tiles-extension.md)、
  [V0](../plans/2026-09-12-v0-architecture-audit.md)
- Resulting ADR: None
- Related SGP: None；本轮只读上游源码
- Audit baseline: `e1244451613f4d0b8a5c6986f69ae56123d4267c`

## Question

当前 Cesium MVT 是否只是框架，已有链路能否承担 Mapbox 式矢量地图？
SceneGIS 现有平面渲染哪些能力可以复用，哪些不能直接成为瓦片渲染后端？

## Current Cesium source facts

### 链路已存在，但目标和约束不同

实际入口是
[MVTDataProvider](../../../packages/engine/Source/Scene/MVTDataProvider.js)，标记为 experimental，
继承 [UrlTemplate3DTilesDataProvider](../../../packages/engine/Source/Scene/UrlTemplate3DTilesDataProvider.js)。

`fromUrl` 先生成 runtime tileset，加载时由 `_createCodec` 调用：

```text
URL template → runtime Cesium3DTileset → fetch tile bytes
  → decodeMVT → tile-local layers/features
  → buildVectorGltfFromMVT → GLB / CESIUM_mesh_vector / metadata
  → VectorGltf3DTileContent → BufferPoint/Polyline/PolygonCollection
      ├─ ordinary: collection.update(frameState)
      └─ clamp: scene.vectorProvider.markSelected(...)
                 → Globe surface tile 的 vector data/texture 管线
```

- [buildVectorGltfFromMVT](../../../packages/engine/Source/Scene/buildVectorGltfFromMVT.js)
  为每个 MVT layer 生成 node，处理 point、line、polygon/hole，
  通过 `EXT_mesh_features` 和 `EXT_structural_metadata` 建立 picking/属性关联。
- `appendTilePointAsLocalPosition`（line 958）固定使用 Web Mercator 反算 lon/lat，
  然后 `Cartesian3.fromRadians` 生成 ECEF，再减 tile origin；并非平面世界坐标。
- [VectorGltf3DTileContent](../../../packages/engine/Source/Scene/VectorGltf3DTileContent.js)
  `applyStyle`（line 245）消费 `Cesium3DTileStyle` 的 show/color、point size/outline、line width。
  这不是 Mapbox Style layer/layout/paint/expression 解释器。
- `update`（line 322）把 clamp collection 交给 `tileset._scene?.vectorProvider`。
  [Scene.js](../../../packages/engine/Source/Scene/Scene.js) 的该 getter（line 1332）
  返回 `this.globe?.vectorProvider`；PlanarWorld 下没有这个 Globe provider。
- [VectorProvider](../../../packages/engine/Source/Core/VectorProvider.js) 使用 geographic Rectangle、
  terrain tiling scheme 和 VectorPipeline 为地形 tile 打包 vector textures。
  不能把这条路径与 legacy `Vector3DTileContent` 的 Worker/shadow-volume 路径混为一谈。
- 本次检查的 MVT/provider/content 文件里没有 glyph/sprite、地图 symbol placement、
  collision 或跨瓦片文字排布实现。`featureIdLabel` 指的是 feature-id attribute，不是地图文字。

### 已确认的缺口

| ID  | 事实与证据                                                                                                                                                                     | 对本扩展的影响                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| A01 | `buildRuntimeTilesetJson`（line 279）/`buildTileNode`（line 339）同步递归构造覆盖范围内直到 maxZoom 的整棵树，随后 JSON.stringify/Blob；默认全球 extent、minZoom=0、maxZoom=14 | 缺少按视图懒创建的 tile tree；新 runtime 不能沿用这个初始化模型      |
| A02 | [decodeMVT](../../../packages/engine/Source/Scene/decodeMVT.js) 的 `decodeLayer` 不保留/检查 layer version；`decodeFeature` 不读取原生 feature id                              | 不能直接满足版本能力判断、原始 identity、跨瓦片去重和 feature state  |
| A03 | `decodeGeometry` 读取 command parameters 时缺少完整的几何序列检查；截断 MoveTo 已复现被接收为错误坐标                                                                          | 不能把现有 decode 成功当作完整合法性验证                             |
| A04 | `getOrAssignAutoFeatureId` 按当前 decoded feature object 分配局部递增 ID；property ID lookup 跨当前 tile 的所有 layer 共用 Map，冲突属性 first-seen wins                       | 内部 GPU feature index 与业务 source/layer/feature identity 必须分离 |
| A05 | builder 把 bigint 等非 number/string/boolean 属性转成 metadata STRING；缺省 string/boolean 分别写空串/false                                                                    | 原始属性语义与兼容样式输入不能不加区分地依赖 GLB metadata 往返       |
| A06 | 普通/贴地出口与 globe/ECEF、Cesium3DTileStyle、实验性 Buffer 紧耦合                                                                                                            | 有实现部件可参考，但整体不是 Mapbox 式双世界地图 runtime             |

A01 的数量是源码推导：全球从 level 0 到 14 共
`sum(4^z) = (4^15 - 1) / 3 = 357,913,941` 个有内容的 tile node，外加 synthetic root。
未执行该大规模分配，没有虚构其耗时/内存实测；范围受限、低 maxZoom 配置仍可能用于小场景。

A02/A03 的最小复现直接导入当前源码，在 Node 内存中构造 PBF，不访问网络、不改产品：

- 合法 point：layer `audit`、version=2、extent=4096、feature id=42、坐标=(10,20)。
  输出坐标与 extent 正确，但 layer 没有 version、feature 没有 id。
- 十进制输入 bytes：
  `[26,23,120,2,10,5,97,117,100,105,116,40,128,32,18,9,8,42,24,1,34,3,9,20,40]`。
- 截断 point MoveTo：command stream `[9,20]`，只提供 X delta，缺少 Y delta。
  当前输出 `[{x:10,y:0}]`，没有拒绝。
- 十进制输入 bytes：
  `[26,16,120,2,10,1,97,40,128,32,18,6,24,1,34,2,9,20]`。

该诊断只覆盖上述确认缺口，不是全面 fuzz/conformance 审计。
这些上游行为尚未修复。项目负责人随后明确完全不依赖 Cesium 实验性 MVT 链路；
V1 只选择独立兼容前端，不再把修补/复用上游 decoder 作为本扩展候选。

### 平面能力与复用限制

| 能力               | 当前源码/契约                                                                                                                       | 可以复用                                                                                           | 不能据此承诺                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 坐标与 tile matrix | [SceneGISPlanarTilingScheme](../../../packages/engine/Source/SceneGIS/Core/SceneGISPlanarTilingScheme.js)、ADR-0002                 | 米制 X east/Y north/Z up、NW XYZ、单 root、无 wrap、完整 world coordinates                         | opaque CRS 自动重投影；World 局部 tile address 等于全球 MVT address                |
| 普通几何           | [SceneGISPlanarPrimitive](../../../packages/engine/Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js) `createInternal`（line 224）   | single GeometryInstance、local origin、同步 Primitive、appearance/pick/lifecycle 思路              | 每个 feature 一个 wrapper 达到地图级 batching；任意 raw Geometry 都有平面语义      |
| 地表               | [_SceneGISPlanarSurface](../../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js)                         | terrain/imagery 已有 selection、资源与 depth replay；surface 使用 `Pass.GLOBE`                     | 把 vector LOD、cache、ready 塞入 terrain/imagery 私有状态                          |
| 连续贴地           | [SceneGISPlanarGroundPrimitive](../../../packages/engine/Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js)、ADR-0023          | stable area/line volumes、depth/stencil、`TERRAIN_CLASSIFICATION`、不随 terrain LOD 重建 footprint | 现有单 instance API 已支持 batch、Mapbox z-order、pattern/dash、relative extrusion |
| 点/文字锚点        | [_SceneGISPlanarAnchorVisualizer](../../../packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAnchorVisualizer.js) | Point/Billboard/Label pools；绝对 Cartesian position，低层 `HeightReference.NONE`                  | Mapbox glyph PBF、字体 shaping、沿线标注、collision、跨 tile 去重                  |

ADR-0017 中批量资格曾使用 moderate Entity profile，ADR-0018 后普通 line/polygon 迁移到 standard Primitive。
这并没有建立跨 Entity 地图 batch。新的 vector-tiles 扩展应有自己的 tile/feature ownership，
不悄然修改 planar-content 已批准的逐 Entity 行为。

### 构建、测试与生成边界

- [scripts/build.js](../../../scripts/build.js) 的 `workspaceSourceFiles`（line 253）、
  `createIndexJs`（line 813）递归收集普通 Source JS 并按 basename default export；Worker 排除在普通 barrel 外。
- `createSpecListForWorkspace`（line 854）与 engine 的 Spec glob 自动纳入 SceneGIS Specs。
- Worker bundling 扫描 `Source/Workers/**`（line 419），但现有 SceneGIS 例外只批准 terrain entry；
  新 vector Worker 仍需独立 ADR/所有权说明，不借用 terrain entry 混入无关任务。
- GLSL 扫描 `Source/Shaders/**/*.glsl`（line 500），遵循 ADR-0030；
  相邻生成 JS、index、SpecList、Build 不手工编辑或提交。
- [server.js](../../../server.js) 提供根目录静态服务（line 386）、ESM bundle route（line 231）
  和 engine/widgets/shader watchers。`Test/vector-tiles/` 可直接使用根开发服务器。
- [Test/README.md](../../../Test/README.md) 的入口命令为
  `npm run start -- --port 8092 --no-embeddings`；页面只加载
  `/Build/CesiumUnminified/index.js` 并提前设置 `CESIUM_BASE_URL`。
- 测试入口是 [gulpfile.js](../../../gulpfile.js) 的 `test`；
  本轮有效过滤为 `--includeName MVT`，命中下面两组共 7 个测试。

## Constraints

格式定义与产品 scope 分开。MVT 2.1 要求调用方在解码前已知 projection/bounds，
允许不同 layer extent 与 tile bounds 外的 buffer geometry；它并不把所有数据都定义为全球 Web Mercator。
这些是选择独立 source matrix 的依据。
参见 [MVT 2.1 原始规范](https://github.com/mapbox/vector-tile-spec/blob/master/2.1/README.md)。

## Options and recommendation

1. 整体复用 native provider：当前平面、样式和调度目标不匹配，不推荐。
2. MVT → 每 feature Entity：容易先出图，但 owner/command 粒度与大规模瓦片目标不匹配，不推荐作为主架构。
3. 独立 SceneGIS vector runtime，复用通用 Cesium 低层能力与独立格式/样式前端：用户已确认独立方向；
   具体 dependency、batch renderer 和 ground 接入待 phase 设计，不先宣称零上游修改。

## Outcome and follow-up

“完全只有框架”不准确：基本解码、GLB、属性、Buffer 和 Globe ground 管线都存在且有测试。
“尚不足以直接承担类似 Mapbox 的矢量瓦片地图”有源码与最小复现支持。
具体产品契约和 V1 决定转入 [实现边界讨论](2026-09-12-rendering-boundaries.md)。

## Validation results

- `npm run test -- --workspace engine --includeName MVT --browsers ChromeHeadless --failTaskOnError`：
  **7/7 通过**，Chrome Headless 152，Windows；包括 decode 2 项、builder 5 项。
- 测试由现有任务生成 development bundles 与 Specs；未运行 release/types/package/GPU 地图资格。
- 第一次使用带 alternation 的 includeName 没有命中测试并返回失败；改用实际有效的 `MVT` 后通过。
  零测试结果不计为验证成功。
- Node 内存 PBF：合法 point 成功；原生 id/version 缺失与截断 MoveTo 错误接收均已复现。
- 未实测 native provider 全球高 zoom 初始化、地图 GPU 性能或视觉正确性。
- 全 `AgentDocs` Markdownlint 通过。全目录 Prettier 报告 231 个既有文件格式问题；
  不为本扩展格式化其他扩展/模板/规范文件。
- 当前扩展 9 个 Markdown 文件的 scoped Prettier 检查通过；更新后全 AgentDocs Markdownlint 通过。
- 59 个仓库相对文件链接均存在；无本机绝对路径；Git 改动仅为本扩展协作文档，
  upstream-owned files 为零，SGP 无变更。未进行产品实现、MapLibre 修改或阶段提交。
