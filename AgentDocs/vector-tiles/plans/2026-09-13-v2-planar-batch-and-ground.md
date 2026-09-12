# Phase Plan: V2 平面批量绘制与直接贴地验证

## Metadata

- Plan type: `phase`
- Status: `completed`（项目负责人于 2026-09-13 确认实际画面验收通过）
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Phase: `V2`
- Owner role: `architecture/execution`
- Architecture review: `confirmed`（验证范围与顺序；后端选择须有 WebGL 证据）
- Architecture reviewer: 当前 Agent 自审
- Created: `2026-09-13`
- Updated: `2026-09-13`
- Entry checkpoint: `80089a0a91`（V1）
- Related discussions: [实现边界](../discussions/2026-09-12-rendering-boundaries.md)、
  [MapLibre 与直接贴地](../discussions/2026-09-12-maplibre-reference-and-surface.md)
- Related reviews: [V2 review](../reviews/2026-09-13-v2-flat-review.md)
- ADR: [ADR-0057](../../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)、
  [ADR-0058](../../../Documentation/SceneGIS/Decisions/ADR-0058-vector-tile-frontend-contract.md)、
  [ADR-0059](../../../Documentation/SceneGIS/Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)
- SGP: None（V2 尚未修改上游；必要 seam 另登记）

## Objective and non-goals

把 V1 独立前端接入真正的 SceneGISPlanarWorld，形成按需加载的 flat 矢量地图。
以本地确定性数据验证 fill/line/circle 的 tile batch、样式层序、alpha、共享边、pick 和销毁。
同时提前验证直接贴地的批量边界，为 V4 选择有证据支持的后端。

不改变已批准的独立 MVT、单根米制坐标、无地图颜色 RTT、Test 人工入口或 Globe 分阶段资格。
本阶段不承诺全部 V1 可计算 paint/layout 均已有等价画面；渲染子集必须明确声明，
不支持的非默认配置需要诊断，不能静默忽略。V3 完善样式质量和流式性能，V4 才给出生产贴地资格。
不提前引入 Worker、symbol、任意重投影、extrusion 或新的 terrain GPU 协议。

## Entry conditions

V0 `122cd2db2e` 和 V1 `80089a0a91` 已形成独立本地提交。
V1 的 35 项 Specs、完整 build/types/release、独立 engine 安装包与补丁审计通过。
当前分支为 `feature/vector-tiles`；不依赖 Cesium experimental vector runtime。
当前 Agent 继续承担架构、执行和自审，无额外任务依赖。

## Current source facts

以下在 V1 checkpoint 后重新查询图谱并核对当前源码；库与旧图谱的快照不作为最终实现事实。

1. `View.createPotentiallyVisibleSet` 按输入 command 顺序收集 extent，`insertIntoBin` 追加到相交 frustum 的
   pass 数组。`Scene.executeCommands` 的 `performPass` 顺序执行这些命令。
   因而同一 frustum 的普通 pass 数组具有可利用的提交顺序，但不是跨 pass、跨 frustum 的全局 painter 保证。
2. Planar surface 已使用 `Pass.GLOBE`；现有 ground 使用 `Pass.TERRAIN_CLASSIFICATION`，
   然后才执行普通 opaque/translucent 内容。应优先实测已有 surface 后的命令槽位，
   不先修改 Scene 或新增 pass，也不凭 source inspection 宣告半透明层序已成立。
3. `Scene.executeCommands` 在部分 pass 中调整 frustum near 以形成边界重叠；
   `czm_writeLogDepth` 会按当前 frustum 丢弃范围外片段。
   这不能自动证明地图 alpha 在 frustum 边界只合成一次；必须设置一个实际跨 frustum 用例。
4. `_SceneGISPlanarGroundCommands` 为 source command 生成 stencil-depth 与 color/pick 两条命令。
   color/pick 在 classification mask 非零处绘制并清零；该 mask 不记录 feature identity。
   多个 shadow volume 直接合成一个 batch 时，重叠属性、顺序、透明度与 pick 不能沿用 single instance 的保证。
5. `_SceneGISPlanarGroundVolume` 使用稳定 XY footprint 与 provider 全局 height envelope，
   不读取 terrain 实际三角形。现有 line shader 有像素宽度与 miter 展开，
   不能据此承诺 Mapbox 的 cap/join/dash 质量。
6. `SceneGISVectorTileStyle` 已提供 layer 顺序、求值与 property kind；
   `SceneGISVectorTileCoordinates` 已区分 tile-local、local-origin、world 与 CSS style zoom。
   V2 不另写 decoder，不把 source LOD 直接作为 paint zoom。
7. 普通 JS/Specs、`Source/Shaders/SceneGIS/**/*.glsl` 已有递归构建入口；
   新 Shader 复用 ADR-0030，不手工编辑生成 JS、index、SpecList 或 types。

## Detailed design and decision sequence

### 先验证命令与直接贴地，再冻结公共 renderer

建立最小真实 Context 用例，使用两个有重叠区域、不同颜色与 alpha 的要素。
分别比较独立绘制参考与合批候选，记录重叠区像素和顶层 feature pick。
同时检查一个 style layer 在所有 tile 上完成之后才进入下一层，避免按 tile 完整画完所有层造成邻接层序错误。

Flat 首选直接 geometry/DrawCommand，按 style layer、tile 和必要 shader/render state 分组。
把颜色、opacity、feature pick identity 放入 batch 数据或有明确索引的属性通道，
不按每个颜色值或每个 feature 创建 public primitive。不能使用任意 Z 偏移代替 layer order。
命令槽位与多 frustum 策略只有在像素/pick 证据通过后才提升为 ADR。

Ground 先测试非重叠、多要素重叠、半透明重叠和不同 pick identity。
如果共享 stencil 合批失败，记录最小复现与命令成本，再比较满足原有直接矢量约束的方案。
不得把失败自动变成逐 feature public wrapper 的产品实现，或回退到地图颜色纹理。
若需要改变长期 ground 架构，先修订 ADR；V2 的试验不改写现有 GroundPrimitive 的公共契约。

### Flat 数据与批量职责

- Core 保持无 world/context 的几何准备；renderer 使用 tile-local 数值与独立 local origin。
- 多 polygon/孔洞保持 V1 分组；线与圆的尺寸使用 CSS pixels，DPR 和透视缩放有明确转换。
- tile buffer 保留到几何准备，最终覆盖裁剪明确处理共享边、线宽扩展和半透明重复绘制。
- style layer 顺序优先于 tile 顺序；同层要素的确定性顺序和 pick 身份必须写入 renderer 契约。
- 原始 feature、业务 id 和 GPU pick index 分开；没有原生 id 时返回明确的 tile-local identity。
- style 更新、layout 重建与 paint 更新的失效边界明确，不能在 warm frame 重解码或重复创建 GPU 对象。

具体公共入口、配置和 GPU packing 在命令验证之后形成 ADR；此处不预先锁定尚未验证的 Shader attributes。

### 最小流式与生命周期

只遍历当前需要的单根 tile cover，设置有限 resident/request/upload 预算。
在实现可见性选择前复查当前 World/camera 的坐标与 cover 接口；
不得依赖 terrain 私有渲染 tile 作为矢量数据唯一索引，也不得构造整棵树。

每个 source/tile 请求有明确 generation 和状态；scheduler deferral 可在后续正常帧重试提交，
HTTP/network/malformed 失败保留错误语义，不隐式重复 retry。
移除、替换或 destroy 后的 completion 不得发布 GPU 数据。
normal render 负责选择、请求、发布、eviction；pick/depth 仅重放已发布状态。

V2 提供最小有界调度和明确失败/空瓦片表现；更完整的 parent/child replacement、
overzoom、预算调优与 Worker 决策属于 V3，不能由 V2 的静态首图推断完成。

## Affected paths

- `packages/engine/Source/SceneGIS/Core/`：必要的独立几何准备。
- `packages/engine/Source/SceneGIS/Renderer/`：只依赖 Core/Renderer 的 GPU 资源职责。
- `packages/engine/Source/SceneGIS/Scene/`：Scene/world/style/source 组装和生命周期。
- `packages/engine/Source/Shaders/SceneGIS/`：实际需要的固定 Shader。
- `packages/engine/Specs/SceneGIS/`：镜像单元与真实 Context 验证；试验 helper 保持 private。
- `Test/vector-tiles/`：明确 HTML 入口、本地 fixtures、中文控制项与人工视觉验收。
- `Documentation/SceneGIS/`、本扩展 AgentDocs：renderer 契约、能力矩阵、证据与 review。
- 上游路径仅在实验证明确需 seam 后列出并登记 SGP，不预先修改。

## Steps and validation

1. **命令验证**：同深度多层与异色 alpha 重叠、正常/多 frustum、opaque 内容遮挡、feature pick；
   结果决定命令提交策略，不能仅检查 command 数组顺序。
2. **Ground 验证**：非重叠与重叠 volumes 的颜色/alpha/pick，线交叉与 provider envelope 变化；
   记录批量粒度、命令成本、失败模式和后端选择，不宣称完成 V4。
3. **冻结 renderer 契约**：形成 ADR 和精确 rendered profile，复核公开入口、所有权、失败诊断、
   batching、裁剪和 source/world matrix 校验。
4. **Flat 闭环**：本地 MVT → V1 source/style/coordinates → batch → Scene；
   自动测试孔洞、相邻 tile、同 source-layer 多 style layer、大坐标与 CSS 像素尺寸。
5. **请求与资源**：受控异步 fixture 验证 deferred、空/失败、过时 completion、替换、eviction 与 destroy。
   warm frames 不重建 VA/Shader/pick id；pick/depth 不请求或改变 cache。
6. **人工入口与资格**：遵守 Test/AGENTS，单 ESM runtime、无公网依赖，pagehide 区分 BFCache；
   定向 Specs、必要 E2E、build/types/release 和 installed Shader/package 消费。
7. **性能证据与自审**：固定设备/浏览器/viewport/build/数据，记录初次与 warm CPU timing、
   command 数和资源平衡；无已定位热点不扩大优化或重复验证。
   用户确认真实 flat 画面后，记录 review 并形成独立 V2 checkpoint，再进入 V3。

## Completion criteria and current handoff

V2 exit 要同时具备 flat 画面、层序/alpha、接缝、pick、资源释放，以及直接贴地的最小证据和方案选择。
源数据/样式前端通过不替代画面验收，直接贴地单对象成功不替代多要素合批资格。

10 项真实 Context 实验通过：flat 同 batch/跨 layer 的颜色与 pick、多 frustum、opaque 前景，
以及 ground 共享 stencil 反例和 surface-depth 凸体候选。固定 readonly style 的 flat 公共入口、
tile/source 预算、覆盖裁剪与 rendered profile 见
[ADR-0059](../../../Documentation/SceneGIS/Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)。
ADR-0059 的平面闭环与 Test 页面已实现；无新增上游修改。
59 项 focused Specs、1 项本地 E2E、完整 build/types/release 与 installed package 已通过。
已修复 alpha 混合状态、Mercator 尺度裁剪射线精度和退化线段上传问题；
精确证据、性能 baseline 与剩余 gate 见 [V2 review](../reviews/2026-09-13-v2-flat-review.md)。

Ground 原计划的 line/provider 完整矩阵不在已证伪的共享 stencil 方案上继续叠加；
替代候选已在倾斜地形验证异色透明重叠与逐 feature 片段归属。凹面、孔洞、线型和完整 envelope/LOD
属于 V4 的生产资格，不能把当前凸矩形证据描述为完成贴地。
项目负责人于 2026-09-13 确认实际画面验收通过；本阶段全部 gate 关闭。
本记录随 V2 实现形成独立本地 checkpoint，之后才激活 V3。
