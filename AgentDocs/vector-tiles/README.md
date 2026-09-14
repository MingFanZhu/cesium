# Vector Tiles

## Metadata

| Field                  | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Extension slug         | `vector-tiles`                                         |
| Status                 | `active`                                               |
| Planning model         | `extension`                                            |
| Active extension plan  | [总体计划](plans/2026-09-12-vector-tiles-extension.md) |
| Current phase          | `G3 completed`                                         |
| Active phase plan      | [G3](plans/2026-09-14-g3-planar-transparency.md)       |
| Active standalone plan | None                                                   |
| Architecture contact   | 当前 Agent                                             |
| Execution contact      | 当前 Agent                                             |
| Last updated           | `2026-09-14`                                           |

## Scope

实现类似 Mapbox 的矢量瓦片能力：MVT、声明式样式、按需调度、批量渲染、贴地和标注。
首个产品里程碑在 `SceneGISPlanarWorld` 验收，共享数据与样式前端考虑 Globe 复用。

已确认：完全独立于 Cesium 实验性 MVT 支持，包括 decoder、provider、vector glTF、
Buffer vector 与 VectorProvider 链路。MVT 解析保持 CRS 无关，tile matrix 限定 `1×1` root，
首轮使用 3857。参考用户已有 MapLibre 任意坐标系实现，见
[参考审计与地形讨论](discussions/2026-09-12-maplibre-reference-and-surface.md)。
用户优先要求保留矢量直接绘制并支持贴地，不采用先合成地图颜色纹理的主路线。

项目负责人本轮明确允许同一 Agent 讨论、设计并在讨论完成后编码。本扩展由当前 Agent
承担架构、执行与自审，保留阶段证据、人工视觉 gate 和独立本地 checkpoint；
不要求绑定第二个任务，不把自审描述为独立评审，也不改写其他扩展的双角色记录。

## Engineering links

- Branch：`feature/vector-tiles`。
- Base：本地 `scenegis/develop@e1244451613f4d0b8a5c6986f69ae56123d4267c`。
- Upstream：`1.144 / 6d5d8b1f0725b6f831b336463f4b11c98023427b`。
- Source：`packages/engine/Source/SceneGIS/Core/SceneGISVectorTile*.js` 和
  `packages/engine/Source/SceneGIS/Scene/SceneGISVectorTileLayer.js`，五个公共入口。
- Specs：Core/Renderer/Scene 镜像测试，169 项覆盖通过；V5A 另有 14 项既有 planar quadtree 回归通过。
- 当前能力：[VectorTiles](../../Documentation/SceneGIS/VectorTiles.md)。
- 人工页面：[城市](../../Test/vector-tiles/planar-city.html) 与 [样式图集](../../Test/vector-tiles/planar-styles.html)，
  21 个城市 MVT fixtures 加 1 个样式 MVT。
- 新页面：[公开地图](../../Test/vector-tiles/planar-map.html)，默认 MapLibre 示例使用的 OpenFreeMap / Bright，
  保留 Liberty 对照，无需 token；来源和样式差距见 [参考](../../Test/vector-tiles/reference/README.md)。
- Globe 页面：[球面地图](../../Test/vector-tiles/globe-map.html)，默认本地；公共数据、整球与真实地形切换。
- 当前页面回归：16 项 E2E，包含中文上手入口与 `Specs/e2e/scenegis-vector-globe.spec.js`；
  使用 `Test/vector-tiles/playwright.config.mjs`，直接连接根开发服务器。
- E2E：`Specs/e2e/scenegis-vector-tiles.spec.js`，3 项通过。
- 公开页 E2E：`Specs/e2e/scenegis-vector-public.spec.js`，5 项通过；使用本地数据拦截外网。
- Sandcastle：不新建；使用根服务器直接访问 `Test/**`。
- ADR：[ADR-0057](../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)。
- SGP：`SGP-0011`；upstream-owned files 为 `packages/engine/package.json`、`ThirdParty.extra.json`。
- V1 ADR：[ADR-0058](../../Documentation/SceneGIS/Decisions/ADR-0058-vector-tile-frontend-contract.md)。
- V2 ADR：[ADR-0059](../../Documentation/SceneGIS/Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)；无新增 SGP。
- V3A ADR：[ADR-0060](../../Documentation/SceneGIS/Decisions/ADR-0060-vector-tile-resident-render-cover.md)；无新增 SGP。
- V3B1 ADR：[ADR-0062](../../Documentation/SceneGIS/Decisions/ADR-0062-vector-stroke-and-coverage.md)；无新增 SGP。

## Current handoff

- 源码事实：[Cesium 与平面能力审计](discussions/2026-09-12-cesium-mvt-and-planar-audit.md)。
- 已解决 discussion：[实现边界与取舍](discussions/2026-09-12-rendering-boundaries.md)。
- 地形专题：[MapLibre 与 surface 方案](discussions/2026-09-12-maplibre-reference-and-surface.md)；
  共享 stencil 合批已证伪，surface-depth 凸体候选已有有限 WebGL 证据，生产资格属于 V4；无颜色 RTT。
- 当前 gate：V0 checkpoint `122cd2db2e`；V1 checkpoint `80089a0a91`，review 与提交 hook 均通过。
- V2 checkpoint：`a6e4383cfc`，项目负责人视觉验收与提交 hook 通过。
- V3A 已实现 resident coverage 与逐块替换，67 项 Specs 和 2 项页面 E2E 通过。
- V3A checkpoint：`ad3ea51f13`，提交检查通过。
- [V3B0](plans/2026-09-13-v3b0-owned-primitives.md) 自有图元已实现并自审通过；
  71 项 Specs、2 项 E2E、构建/类型/release/安装包通过，延用 V3A 已验收视觉基线。
  Checkpoint：`d2667e6ad4`。
- [V3B1](plans/2026-09-13-v3b1-vector-style-primitives.md) 自有 stroke、dash 数值表、fill fringe 与
  circle blur 已实现；87 项 Specs 和 3 项 E2E 通过。项目负责人于 2026-09-13 确认
  新增样式图集验收通过，阶段与 review 已关闭；checkpoint：`e7be6ef61a`。
- 当前 [V3C0](plans/2026-09-13-v3c0-public-map-and-style-baseline.md) 已实现公开地图、
  Bright/Liberty、固定 Streets 离线参考、显式样式排除清单和真实负载测量；
  两项新 E2E 与 Bright 在线 smoke 通过，负责人于 2026-09-13 确认公开页并转入标注架构讨论。
  负责人已明确采用 MapLibre 示例来源，Mapbox 官方数据访问不再是阶段前提。
- 用户已明确：以 MapLibre 图形能力为目标，自有地图图元避免大量修改 Cesium native primitives。
  正式边界见 [ADR-0061](../../Documentation/SceneGIS/Decisions/ADR-0061-owned-vector-tile-primitives.md)。
- Latest review：[G3 review](reviews/2026-09-14-g3-planar-transparency-review.md)；
  自有命令继续复用 Cesium pick 派生；V3B0-R04 的临时线数学桥接已移除。
- V3C0 checkpoint：`0bec9cbe56`，公开地图阶段独立提交和 hook 通过。
- Resolved discussion：[标注架构](discussions/2026-09-13-symbol-architecture.md)；
  已审计 MapLibre 资源/排版/placement/跨 tile 与 Bright 的 25 个 symbol layers。
  建议将平面点标注、沿线标注提前，地形标注在 V4 后验收；负责人已批准，进入 [V5A](plans/2026-09-13-v5a-point-symbols.md)，契约见 [ADR-0063](../../Documentation/SceneGIS/Decisions/ADR-0063-point-symbol-renderer.md)。
- V5A 已实现独立字体/图标资源、横排文字、统一 collision、跨 tile identity 和自有 GPU 图元；
  [本地点标注图集](../../Test/vector-tiles/planar-symbols.html) 与公开地图 Bright/Liberty 各 15 个 point layers 已交付。
  108 项 Specs、7 项 E2E 已通过；北京 14 级 555 candidates / 278 placed，72 ranges，无资源失败。
  build/types/tsc/release/独立安装包、修改范围格式、全 AgentDocs Markdownlint 与上游审计通过。
  [正式点标注能力](../../Documentation/SceneGIS/VectorTileSymbols.md) 列出支持属性、缓存与失败语义。
- 风险：dash 拐角变形与跨 tile 相位、无历史数据/紧 cache 的缺图、mixed LOD 量化差异；
  V3C1 密集性能、V4 生产贴地、V5B 沿线与复杂 placement。
  V2-R05 与 V3B1-R08 已关闭。
- 浅俯角反馈已修正：负责人确认透视投影并要求遵循现有影像/地形选层。
  共享 planar SSE、预算内 mixed desired leaves、视轴交点 style 比例和不可见 point anchor 剔除已完成。
  126 项 Specs（112 vector + 14 planar quadtree）、8 项 E2E 通过；在线原 5° 视角保持中心/heading/zoom，
  64 tiles 横跨 level 3–14，无资源错误，CPU median/P95 10.3/11.8 ms。
  当前页面已刷新并保留该视角；见 [ADR-0064](../../Documentation/SceneGIS/Decisions/ADR-0064-vector-perspective-lod.md)。
- 负责人在修正交付后要求继续特殊标注，V5A 按推进授权关闭 gate；独立 checkpoint `50ab83b96f` 与 hook 通过。
- [V5B](plans/2026-09-13-v5b-line-symbols.md) 已实现逐字曲线、map/viewport 对齐、路牌、箭头、
  keep-upright、max-angle、间距和邻 tile 重复抑制；不做跨 tile 语义道路拼接。
  [沿线验收页](../../Test/vector-tiles/planar-line-symbols.html) 完全本地；公开 Bright 118/119、Liberty 107/111 层。
  126 项 Specs、9 项页面 E2E、build/ESLint/tsc 通过；技术自审通过，负责人视觉 gate pending。
  正式决定见 [ADR-0065](../../Documentation/SceneGIS/Decisions/ADR-0065-line-symbol-placement.md)。
- 公开页按负责人最新要求采用 Viewer 默认持续渲染和原生 `debugShowFramesPerSecond`；
  已移除自定义 FPS 面板与渲染模式开关。原生 MS 是帧间隔，独立保留 60 帧 CPU 测量。
  相关公开页 3 项本地 E2E 与 ESLint 通过；V5B 视觉 gate 仍 pending。
- V5B 交互掉帧已复现并修正：预过滤/缓存、Camera 投影快照、稳定比例，以及单 style layer
  失效和 constant paint attributes；129 项 Specs、9 项 E2E 通过。实测对比与剩余边界见
  [V5B review](reviews/2026-09-13-v5b-line-symbol-review.md)，阶段仍等待负责人验收。
- 负责人追加远景注记筛选：透视 anchor 深度超过中心地面参考的四倍时整组剔除，
  相机接近后恢复；正交和俯视保持。柏林 5° 同视角去掉 34 个地平线远景标注，
  保留 87 个近景标注与 64 块地图瓦片；最新 engine 构建的 20 项 symbol Specs 通过。
  构建入口与完整证据见当前 review，视觉 gate 仍 pending。
- Resolved discussion：[平面远景加载范围](discussions/2026-09-13-planar-distant-tile-loading.md)。
  负责人要求保持浅俯角三维能力，在选取阶段限制远处瓦片，供 MVT、影像和地形共同使用。
  已完成共享四叉树、独立 MVT cover 和 terrain dependency 审计；建议保留粗远景、限制细分。
  负责人已批准低角度专用策略，当前实现与验证见 V3C1A。
- 负责人于 2026-09-13 批准实施远景处理，新增硬边界：只针对低角度倾斜视图，
  俯视拉远不能触发。V5B 按推进授权关闭 gate，先形成独立本地 checkpoint；
  上述 pending 记录为历史交付状态，当前以此结论与 completed review 为准。

- V5B checkpoint：`bb007b3518`；当前进入 [V3C1A](plans/2026-09-13-v3c1a-tilted-distance.md)，仅低角度透视启用共享细节距离，俯视拉远保持。
- V3C1A 已实现并技术自审通过，World 距离默认 Infinity；公开页启用 100000 米。
  197 项相关 Specs、131 项既有 vector 回归及 5 项页面 E2E 已覆盖通过，build / buildTs / tsc 通过。
  柏林 5° 的 MVT 64→47，surface 219→105，load dependencies 473→241；俯视拉远 keys 一致。
  新增 [本地地形/影像对照](../../Test/vector-tiles/planar-distance.html)，详情与剩余近景性能风险见最新 review。
  负责人已明确要求推进异步 Worker，按推进授权关闭 V3C1A gate；先形成独立 checkpoint，再激活 V3C1B。

V3C1A checkpoint：`413b7ffcc6`。负责人明确授权 Worker 实现，当前 [V3C1B](plans/2026-09-13-v3c1b-worker-preparation.md) active。

V3C1B 技术资格完成：143 项 Specs、11 项 E2E、完整 build/types/release 与实际 installed-package
Worker transfer 通过；[最新 review](reviews/2026-09-13-v3c1b-worker-review.md) 记录冷加载收益、
首次完整就绪代价与未解决的主线程/GPU 性能边界。当前等待负责人浏览器验收，不激活下一阶段。

负责人反馈持续交互低帧后继续修复：143 项 Specs、8 项相关 E2E 通过；真实浅角 pan/rotate CPU
median 从约 36 ms 降至 22.0/22.8 ms，密集 tile 拆分 Worker 错误已修复。最新 review 的
Owner motion feedback 记录完整条件与剩余 R07，阶段 gate 仍保持打开。

负责人已授权继续三项标注交互优化。V3C1B 按推进授权关闭 gate，先形成独立 Worker checkpoint；
R07 的 placement/碰撞/buffer 部分由后继 V3C1C 承接，其余预算/GPU 资格保留，不宣称稳定 60 FPS。

V3C1B checkpoint：`065c345efd`。当前 [V3C1C](plans/2026-09-13-v3c1c-symbol-motion.md) 已获授权，按 ADR-0068 实施标注交互优化。

V3C1C 技术自审通过：候选持久缓存、2 ms 软预算 placement、独立 collision proxies 与
static/dynamic dirty buffers 已实现。146 项 vector Specs、8 项相关 E2E、engine/root/release
构建及三种实际安装/发布入口的文字绘制、pick、平移无上传和销毁检查通过。
同机浅角 pan/rotate CPU median 从 23.0/23.5 ms 降到 12.9/13.3 ms；原视角为 7.6/8.0 ms。
保守碰撞使浅角静止标注 201→189，布局更新存在预算延迟；详见最新 review 和
[ADR-0068](../../Documentation/SceneGIS/Decisions/ADR-0068-symbol-placement-and-dynamic-buffers.md)。
公开页已刷新并恢复原相机，资源就绪且无错误。负责人于 2026-09-13 明确确认验收通过，
V3C1C gate 已关闭，本阶段实现与记录形成独立本地 checkpoint；不激活 V3D，
不把 CPU 指标当作稳定 60 FPS 或 GPU 吞吐资格。当前地形问题属于架构说明：公开矢量图层仍为
无 terrainProvider 的 Z=0 flat 后端，surface-depth 只有 V2 可行性证据，生产贴地仍属 V4。

默认地表/Globe 共存的源码复核已补入[地形讨论](discussions/2026-09-12-maplibre-reference-and-surface.md#默认地表共存与-globe-复用复核)：
当前 flat 并未删除 World surface；后续保留 Globe/terrain，以地表深度支持自有矢量贴附。
这是架构澄清，V4/G1 尚未激活，不表示公开图层已支持 terrainProvider 或 Globe。

V4A 已实现并技术自审通过：平面 direct ground、terrain anchors、公开 Esri 地形开关与山地定位。156 项相关 Specs、9 项 E2E、build/types/release/installed-package 通过。本阶段无 upstream-owned 修改、无新 SGP。负责人于 2026-09-14 确认验收通过，技术与视觉 gate 已关闭，详见 [V4A review](reviews/2026-09-14-v4a-planar-terrain-review.md)；不把本阶段结果扩展为完整曲面文字或 Globe 资格。

V4A checkpoint：`a961ff4ccb`。负责人确认验收并授权提前进入 [G1](plans/2026-09-14-g1-globe.md)，共享前端并独立验证 Globe 曲率、地形和标注。

G1 已实现并技术自审，负责人于 2026-09-14 确认性能修正可接受，视觉与交互 gate 关闭。见 [最新 G1 review](reviews/2026-09-14-g1-globe-review.md)
和 [ADR-0070](../../Documentation/SceneGIS/Decisions/ADR-0070-globe-vector-ground-rendering.md)。
169 项 vector Specs / 13 项 Globe Specs、初始 13 项页面 E2E 通过证据与性能修正后 2 项相关 E2E、
build/types/tsc/release/实际包已覆盖。新增 [Globe 本地/公开入口](../../Test/vector-tiles/globe-map.html)，保留 native Globe、独立
EPSG:3857 matrix 与 Worker；native terrain 上直接画面/线、ECEF 标注与独立异步 BVH。
无 upstream-owned 修改，无新 SGP；公共字体、完整曲面字形和性能边界见 G1-R09/R10/R16。
负责人反馈浅倾角低帧后，修正椭球遮挡、GPU 数据与共享资源、派生命令失效、fractional zoom
抖动和真实地形片元成本。同机原视角静态约 28→60 FPS、旋转/平移中位约 58 FPS，Alps 真实
地形约 22→57–60 FPS；交互 P95 仍为 22–26 ms，完整条件与对照见最新 G1 review。
本阶段实现、Specs、ADR 与记录形成独立 G1 本地 checkpoint，不激活下一阶段。
负责人随后询问 hillshade 与高级环境的关系；当前能力边界已补入 [光照说明](../../Documentation/SceneGIS/VectorTiles.md#地形明暗hillshade-与高级环境)。
高级环境光照与阴影 receiver 尚未接入 vector，不能从普通贴地验收推断兼容；由后续 V4/M1 资格工作承接。

G1 checkpoint：`a2f71e1120`。负责人明确授权接入高级环境，当前进入 [V4B](plans/2026-09-14-v4b-environment.md)。
MapLibre hillshade 不作为当前交付目标；按 [ADR-0071](../../Documentation/SceneGIS/Decisions/ADR-0071-vector-environment-lighting.md)
复用现有物理光照、云影和 HDR 合成，独立验证双世界与 Globe 定向几何阴影 receiver。

最新 [V4B review](reviews/2026-09-14-v4b-environment-review.md)：实现和技术自审通过，173 项 vector Specs、
双世界实际环境及既有地形页面 E2E、build/types/release/实际安装包验证通过。全部改动为 SceneGIS-owned，
无 SGP；新增环境 GPU 成本与限制已记录。补充环境参数分组和原生 Timeline/Animation 后，
2 项双世界页面回归通过，验证光向/云时间同步、参数与时间保留、恢复默认和资源释放。
负责人于 2026-09-14 明确手动检查通过，视觉 gate 关闭，V4B completed，形成独立本地 checkpoint。
当前没有 active phase；近地平线重负载问题仍为 V4B-R06 open，由后继 M1 定位，其他未资格范围见 R07。

V4B checkpoint：`723a2feed9`。负责人继续反馈南京水平绕转时 POI 消失/出现与掉帧同步，
已进入 [V3C1D](plans/2026-09-14-v3c1d-symbol-orbit.md)，限定标注缓存、调度与相关测量。

V3C1D 实现与技术自审通过，负责人视觉/交互 gate pending。确认复现期间没有字体请求；修正 resident
候选缓存、空间预筛选、排版待处理队列和字形统计扫描。28 项 symbol Specs、4 项相关页面 E2E 通过，
同南京轨迹帧间隔 P95 60.4→36.9 ms，最长布局延迟 920.4→346.3 ms；原视角恢复后标注数一致。
完整条件与剩余新瓦片/GPU 风险见最新 review。本阶段全部为 SceneGIS-owned，无 SGP；验收后独立提交。

负责人追加浅倾角道路文字尺寸检查：已补齐 map-pitch 的部分透视尺寸补偿，保持沿线字距、碰撞和拾取一致，
保留真实倾斜压缩。29 项 symbol Specs、2 项相关页面 E2E 通过，原“中山南路”投影宽 201→128 px；
相机固定在新的 5.05° 反馈视角，视觉 gate 仍 pending。实现边界见 ADR-0065，证据见最新 review 的 R07。

负责人认可当前功能并转向简单上手示例，V3C1D 按推进授权关闭视觉 gate，review R06 accepted。
以上 pending 为历史记录；先形成独立 checkpoint，再开展示例整理，重负载性能风险继续保留。

V3C1D checkpoint：`971a7b333b`，提交 hook 的 ESLint/Prettier/tsc/Markdownlint 通过。
当前进入 [E1](plans/2026-09-14-e1-quickstart-examples.md)，只重写简单上手示例，独立展示平面和球面。

E1 首版四页技术验证通过后，负责人要求进一步清理，阶段仍 active。
当前 [中文上手目录](../../Test/vector-tiles/examples/示例目录.html) 仅保留“平面地图”和“球面地图”两个公开示例，
本地上手版删除。旧测试页按 planar-/globe- 命名，独立世界初始化，移除高级环境与时间控件；
生成数据和产品环境验证保留。当前验证与剩余 gate 见 [E1 review](reviews/2026-09-14-e1-quickstart-examples-review.md)，
无产品 runtime 或上游修改。

负责人确认矢量独立层和透明适配方向，E1 按推进授权完成，先建立独立 checkpoint，再进入透明渲染阶段。

E1 checkpoint：`3d9dcfe7a3`。当前进入 [G2](plans/2026-09-14-g2-surface-transparency.md)，
负责人明确首轮只显示当前可见地表；独立矢量 opacity 与 Globe 地表/影像透明按 ADR-0072 / SGP-0012 接入。

G2 实现与[技术自审](reviews/2026-09-14-g2-surface-transparency-review.md)通过，负责人视觉 gate pending。
181 vector + 20 native transparency Specs、7 项页面 E2E、build/types/release 与三种实际包入口通过。
球面页提供矢量、地表和本地测试影像三项透明度；平面复用 vector opacity。上游只改 GlobeTranslucencyState.js。
背面/地下、跨透明表面排序、Planar 整体透明与高级环境透明深度合成仍为后继资格范围。

负责人要求平面也支持透明，G2 按推进授权关闭 gate，先形成独立 checkpoint，再开展 Planar 后继阶段。

G2 checkpoint：`9e33cbd279`。当前 [G3](plans/2026-09-14-g3-planar-transparency.md) 按负责人授权实施平面整体透明，见 ADR-0073。

G3 技术自审通过：World.opacity 与平面地表/影像 UI 已接入，255 项相关 Specs、6 项平面 E2E、
完整 build/types/release/实际包验证通过，详见最新 review。仅复制 surface 之前的背景，矢量继续直接绘制；
linear/log 多视锥地形单次颜色贡献、MSAA/HDR、resize、pick 与资源释放已验证。
本阶段全部 SceneGIS-owned，无新增 SGP；负责人视觉 gate pending，未形成 G3 checkpoint。

负责人确认并要求在上手示例使用 lil-gui 控制矢量不透明度，G3 按推进授权关闭 gate，先独立 checkpoint。
