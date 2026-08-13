# 总体计划：Viewer 声明式平面启动

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Parent checkpoint: `685a3bb06e54243706e1b73caef5833d48bdf197`
- Related discussions: None
- Related reviews: None
- ADR: amend `ADR-0006-planar-viewer-and-widget-integration.md`
- SGP: reuse active `SGP-0002`

## Objective

在不改变真正平面 Cartesian3/米制/Z-up 契约的前提下，让常见应用从一个 `Viewer` 构造入口声明平面 extent、opaque CRS、
maximum level 和 World 渲染参数。Viewer 负责把声明式配置组装成 Extent → CoordinateSystem → World，并继续复用现有
planar controller、Home、widget capability guards、DataSource integration 和 Scene primary-world lifecycle。高级应用仍可传入
已构造的 live World；两条路径产生相同的 resolved World 与运行时行为。

## Non-goals

- 不把 EPSG:3857、Web Mercator extent、maximum level 或任何 provider 设为产品默认值。
- 不让 Viewer 解析 CRS、重投影坐标、推断天文 project origin 或替应用选择服务。
- 不把 imagery/terrain provider、layer filter、Material、Environment、SkyBox 或 controller customization 塞入声明式 World
  bootstrap；这些对象依赖 resolved tiling scheme 或 caller ownership，继续在 Viewer 返回后显式配置。
- 不让 `CesiumWidget` 同时接受该配置，不支持 arbitrary `SceneGISWorld` descriptor 或 runtime World replacement。
- 不顺带实现前序扩展列出的 3D Tiles、GeoJSON/CZML/KML 自动转换、Viewer tracking/flight、split/cutout、shadow/weather。

## Stable architecture boundaries

1. 新入口为 `Viewer.ConstructorOptions.planarWorld`，类型是 `Viewer.PlanarWorldOptions`；它与现有 `world`、任何 defined
   `globe` 互斥。现有 `world` 继续只接受 live `SceneGISPlanarWorld`，不重载为 structural object。
2. `Viewer.PlanarWorldOptions` 必须显式包含 raw finite square extent boundaries 与 `maximumLevel`；`crs` 仍是 optional opaque
   metadata。它还镜像当前 `SceneGISPlanarWorld` 的构造参数，不复制后构造期 mutable state。
3. 不接受 `planarWorld: true/false/null`，不接受 coordinate-system instance shortcut。需要自定义或复用实例时使用现有
   `world` 高级入口。
4. SceneGIS-owned private helper构造 Extent、CoordinateSystem 与 World；upstream-owned `Viewer.js` 只负责 option routing、
   preflight、resolved World forwarding、getter与现有 lifecycle seam。
5. 所有 deterministic config/option错误必须在 child Viewer DOM、WebGL Context、controller registration、requestRender 或外部
   resource mutation 前 fail-fast。先完整验证 Viewer planar option matrix，再创建 World candidate。
6. Viewer 成功后 `viewer.planarWorld` 返回 resolved `SceneGISPlanarWorld`，无论来源是 live `world` 还是声明式 `planarWorld`；
   Globe Viewer 返回 `undefined`。它与 `viewer.scene.world` identity 相同，是只读引用而非第二所有者。
7. Scene 继续按照 ADR-0001 拥有并 exactly-once 销毁 primary World。Viewer 继续先移除 owned planar camera controller，再销毁
   CesiumWidget/Scene/World。声明式 config 对象及 raw extent 不被运行时保留。
8. `viewer.planarCameraController`、planar Home、disabled Earth widgets、tracking/zoom/flight guards与现有 `world` 路径完全复用；
   不创建第二 controller，也不改变 Globe 或 `globe:false` 行为。
9. Provider 组装发生在 Viewer 返回后，通过 `viewer.planarWorld.tilingScheme` 创建并安装。Viewer 不持有 provider factory、URL
   或异步 bootstrap transaction。
10. `Viewer.js` 的全部新增 hunk复用 `SGP-0002` paired markers；不修改 `Scene.js`、`CesiumWidget.js`、SGP-0001/0003 或生成文件。
11. Direct `Test/平面环境.html` 迁移为新入口并继续使用中文 lil-gui；项目负责人自有 `Test/地形.html` 不读取、不修改、不暂存。
12. Phase 串行；V1通过Architecture review、必要manual gate与独立checkpoint后才建立V2详细计划。

## Source and baseline facts

- Base/HEAD=`685a3bb06e54243706e1b73caef5833d48bdf197`，branch=`feature/planar-viewer-bootstrap`。
- 当前 `Viewer.ConstructorOptions.world` 只接受 live `SceneGISPlanarWorld`；`validatePlanarViewerOptions`在Viewer child DOM前执行，
  并冻结 planar-incompatible option matrix。
- Viewer已把resolved World转发给`CesiumWidget({world})`，自动创建唯一`SceneGISPlanarCameraController`、关闭legacy inputs、使用
  planar Home，并在destroy时先remove controller。Scene经SGP-0001拥有并销毁World。
- 当前 `SceneGISPlanarWorld` 需要 `SceneGISPlanarCoordinateSystem` 与 `maximumLevel`；CoordinateSystem又需要严格正方形
  `SceneGISPlanarExtent`。这三级无GPU/网络副作用，适合由SceneGIS-owned helper同步组装。
- 影像与地形 provider必须使用World canonical `tilingScheme`。因此不能在同一个普通options object中预先构造正确provider，
  除非引入factory/URL协议；本扩展明确不这样做。
- 受版本控制的 `Test/平面环境.html` 当前手工创建三级对象，并使用低层 `CesiumWidget` 手工注册camera controller；它是V1
  direct migration与manual evidence目标。
- `Viewer.js` 已由active `SGP-0002`跟踪，manifest tests已包含`SceneGISPlanarViewerSpec.js`；本扩展沿用同一集成目的，无需
  新SGP。
- 前序五个大型扩展及刚完成的`planar-environment`均无open discussion或unresolved review；其余明确候选不阻塞本扩展。

## Phase roadmap

| Phase | Objective                                                                  | Dependencies                           | Entry gate                                                               | Exit gate                                                                                  | Status      | Phase plan                                                      |
| ----- | -------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------- |
| V1    | 增加声明式planarWorld、resolved getter、失败/所有权闭环与direct Test迁移。 | E5 checkpoint、ADR-0001/0006、SGP-0002 | 审计Viewer preflight、World constructors、controller/destroy与生成声明。 | Public contract、focused Specs、types/docs/package、direct browser/manual和SGP audit通过。 | `completed` | [V1](2026-08-14-phase-v1-declarative-planar-world-bootstrap.md) |
| V2    | 联合现有live-world与声明式路径完成dev/release/npm/upgrade交付并关闭扩展。  | V1 checkpoint                          | 重新审计E2E、installed widgets package与最小回归矩阵。                   | 两种入口在dev/release/npm/lifecycle/docs中统一闭环，无open finding。                       | `proposed`  | V1 checkpoint后建立                                             |

## Cross-phase validation

- 精确Spec覆盖raw config、live World、Globe和`globe:false`，并验证DOM前错误、identity、controller/Home、destroy顺序。
- 公共API变化必须通过build-ts/build-docs/tsc与installed widgets declarations/API，生成文件不得进入Git。
- 至少一个真实Context/直接浏览器路径使用声明式EPSG:3857配置，再显式安装现有公开影像/地形provider。
- V2使用同一blocked-network local E2E分别资格dev/release，不依赖公网。
- 每phase运行changed-scope static、`git diff --check`、official upstream audit与exact generated/status审计。

## Global risks and dependencies

- `Viewer.js` 是高频上游文件；新增代码必须留在既有SGP-0002能力边界，升级时重点复核constructor option JSDoc、preflight位置、
  CesiumWidget forwarding、controller registration、Home和destroy顺序。
- Viewer构造并非全局transaction；V1只承诺全部确定性planar config/option错误在DOM前失败，并保持已有CesiumWidget/WebGL
  外部失败语义，不借本扩展重构整个上游constructor。
- 新config和live World必须明确互斥，避免同一Scene出现双World所有权或一条配置被静默忽略。
- `planarWorld`名称同时是constructor option和read-only instance getter；types/API文档必须清楚区分配置对象与resolved World。
- Direct example会从CesiumWidget迁移到Viewer；必须显式关闭不需要的通用UI，保持现有中文panel、public provider、Clock、
  Environment、BFCache与caller-owned SkyBox生命周期。

## Overall acceptance criteria

- 应用可用一个Viewer constructor和一个raw planar config获得live World、planar navigation与Home，不需要直接实例化Extent、
  CoordinateSystem、World或CameraController。
- Existing `Viewer({world})`、Globe Viewer和`globe:false`兼容行为不变；所有冲突在DOM/WebGL前明确报错。
- Resolved World可用于随后创建canonical imagery/terrain providers，且Scene exactly-once ownership/destroy保持。
- Direct Test、focused Specs、dev/release、installed widgets package、types/docs、ADR/Guide/UpgradeChecklist和SGP audit全部闭环。

## Progress and handoff

- V1实现与自动化/直连浏览器证据已完成；focused Viewer aggregate 20/20、build/release/types/docs/tsc、installed package与
  official audit通过。
- Current review:
  `../reviews/2026-08-14-v1-declarative-planar-world-bootstrap.md`（Architecture/code approved；manual gate passed）。
- V1等待Architecture独立checkpoint；项目负责人自有untracked `Test/地形.html`未读取/修改/暂存；checkpoint前不得进入V2。
