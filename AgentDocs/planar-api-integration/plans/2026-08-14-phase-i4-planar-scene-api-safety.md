# Phase Plan: I4 Planar Scene API Qualification and Safety

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Planar API integration extension](2026-08-14-planar-api-integration-extension.md)
- Phase: `I4`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture code review: `approved`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- I3 final checkpoint: `dfc8be40a92503b01b8ae9938a0e2ae581e3a878`
  （`实现平面实体跟踪`，not pushed）
- Assignment base: `dfc8be40a92503b01b8ae9938a0e2ae581e3a878`
- Architecture checkpoint: `22bd7e1c29`（`实现平面 Scene API 安全边界`，not pushed）
- Related discussion:
  [Cesium public API planar compatibility](../discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
- ADR: create `ADR-0039`; amend `ADR-0006`; consume `ADR-0037`
- SGP: create proposed `SGP-0007` for `Scene.js`; reuse the existing purposes of
  `SGP-0001`, `SGP-0002`, and `SGP-0004`

## Objective

让 live/declarative `SceneGISPlanarWorld` 对 Cesium 通用 Cartesian Scene API 具有明确、可执行的支持证据，并让仍依赖
`Cartographic`、`Rectangle`、`Ellipsoid` 或 Earth native effects 的入口在返回貌似合理但语义错误的结果前失败。
I4 只建立 API 资格与安全边界，不实现新的平面阴影、雾、格式转换或 3D Tiles 能力。

## Non-goals

- 不改变 `Cartographic`、`Rectangle`、`Ellipsoid`、map projection 或
  `Transforms.eastNorthUpToFixedFrame` 的公共语义。
- 不实现 planar Fog、ShadowMap、native SkyAtmosphere、Earth `SkyBox`、native Sun/Moon 或第二套 Environment。
- 不把 `Scene.sampleHeight*`、`clampToHeight*` 重载为 Cartesian union API；平面高度继续使用 World/Sampler API。
- 不支持 3D Tiles/ECEF、MostDetailed Tileset LOD、GeoJSON/CZML/KML CRS 转换、clustering、Voxel 或 point cloud。
- 不给 `Camera.positionCartographic` 伪造 planar 值，也不为它建立破坏 Cesium 内部 `UniformState` 的运行时 getter guard。
- 不修改 Picking、Fog、ShadowMap、SceneTransforms、CameraFlightPath、World、Environment、Shader、Worker 或生成文件。

## Entry conditions

- Branch=`feature/planar-api-integration`，assignment base=
  `dfc8be40a92503b01b8ae9938a0e2ae581e3a878`。
- I3 Architecture/code review approved，I3-R001-I3-R005 closed，项目负责人 manual gate passed；I3 final checkpoint 已创建且
  not pushed。
- Working tree 只允许保留 Architecture-owned
  `AgentDocs/planar-viewer-bootstrap/README.md` 与
  `AgentDocs/planar-viewer-bootstrap/plans/2026-08-14-planar-viewer-bootstrap-extension.md` 历史 diff。
  Execution 不得修改、暂存或提交这些排除项；项目负责人文件 `Test/地形.html` 仍不得读取、修改或暂存。
- Execution 开始前读取 root/engine/widgets AGENTS、DevelopmentGuide 相关章节、Architecture、ADR-0006/0037、extension
  index/plan/discussion、本 phase plan 与当前 SGP manifest。
- 继续采用事件驱动交接；Execution 完成或遇到 blocker 时主动通知 Architecture，不轮询或等待 Architecture 对话。

## Current source facts

1. `SceneTransforms.computeActualEllipsoidPosition` 在 `SCENE3D` 原样 clone world `Cartesian3`；
   `worldToWindowCoordinates`、`worldToDrawingBufferCoordinates` 与 `drawingBufferToWorldCoordinates` 的 3D 分支使用
   view/projection/viewport 矩阵，不需要椭球转换。
2. `Scene.pick`、`drillPick`、`pickPosition` 已在 Surface/Ground/Environment real Context 中产生平面证据；普通
   `pickFromRay/drillPickFromRay` 的 offscreen camera 直接采用 ray origin/direction 与矩阵深度。MostDetailed 变体主要驱动
   Cesium3DTileset LOD，I4 不把它宣传为 SceneGIS public capability。
3. `Scene.sampleHeight*` 先把 `Cartographic` 转为 ellipsoid surface position，再沿 geodetic normal 发 ray；
   `clampToHeight*` 从 Cartesian 反算 Cartographic 并复用同一路径。它们不能通过参数名或单位约定变成平面 API。
4. `Scene.sampleHeightSupported` 与 `clampToHeightSupported` 当前只反映 depth texture，因而会在 planar Scene 错误返回 `true`。
5. `Fog.update` 每帧读取 `camera.positionCartographic.height` 和椭球 outward normal；`ShadowMap` 克隆
   `positionCartographic`、调用 ellipsoid cartographic conversion/geodetic normal。两者均未适配 planar coordinates。
6. `Scene` 在默认 WGS84 下自动把 `fog.enabled` 设为 `true`；`CesiumWidget` 会把 `options.shadows` 传给 Scene。
   当前 non-Globe world 构造已阻止默认 Earth environment，但仍接受显式 native `skyBox`/`skyAtmosphere`/`shadows`，并接受
   `ellipsoid`、map projection 与非 3D mode 等无 planar 语义的选项。
7. `Camera.getRectangleCameraCoordinates`、`pickEllipsoid` 与 `computeViewRectangle` 仍直接执行 ellipsoid/Rectangle 算法。
   I1 已使 Rectangle destination 与 globe-only flight options fail-fast，但没有覆盖这三个独立 public 方法。
8. `Camera.positionCartographic` 被 `UniformState`、Camera change detection、Scene internal state 以及被禁用的 Fog/Shadow/Globe/
   3D Tiles 路径读取。直接让 getter throw/undefined 会破坏通用 render invariants；I4 必须把它明确记录为 Cesium internal
   ellipsoid projection，而不是可供 planar application 消费的位置。
9. `SceneGISPlanarWorld` 已提供 `getTerrainHeight`、`pickTerrain`、`pickTerrainFromWindowPosition`，并有
   `SceneGISPlanarTerrainSampler` 作为 provider-level async height API；不需要平行复制 native Picking。
10. `Scene.preRender` 早于内部 `render(scene)`；`render` 首先调用 `updateFrameState`。因此在 `updateFrameState` mutation 前做
    non-Globe native-effect validation，可以捕获同一 preRender frame 的晚期突变，并同时覆盖 offscreen ray picking。

## Detailed design

### Generic Cartesian qualification

- 保持原 Cesium 实现，不为通用 API 增加平行 facade。I4 资格矩阵明确支持：
  - `Camera.getPickRay` 与 Cartesian Ray/Plane/Matrix/BoundingSphere；
  - `Scene.cartesianToCanvasCoordinates`；
  - `SceneTransforms.worldToWindowCoordinates`、`worldToDrawingBufferCoordinates`；
  - `Scene.pick`、`drillPick`、`pickPosition`；
  - ordinary `pickFromRay/drillPickFromRay` 仅作为现有 private/internal Cartesian seam 的回归证据，不升级为新 public contract。
- real Context 使用已渲染 planar terrain/primitive 验证 screen coordinate、pick object、depth Cartesian 与 ray intersection 互相一致；
  Perspective 与 Orthographic representative 都要覆盖，高 DPI/drawing-buffer 比例至少覆盖一例。
- `pickFromRayMostDetailed`/`drillPickFromRayMostDetailed` 保持 Cesium3DTileset-specific，不增加 SceneGIS 支持声明、guard 或实现。

### Scene height/clamp safety

- 新增唯一 basename 的 SceneGIS-owned private helper，按 live non-Globe primary World 判定 Scene；不得按 CRS、ellipsoid、数值范围或
  DOM 状态推断。
- planar/non-Globe Scene 的 `sampleHeightSupported` 与 `clampToHeightSupported` 必须为 `false`；Globe 与 `globe:false` 继续返回原
  Context capability。
- `sampleHeight`、`sampleHeightMostDetailed`、`clampToHeight`、`clampToHeightMostDetailed` 在调用 Picking、分配 most-detailed
  operation、修改输入数组/result 或产生 Promise 前同步抛英文 `DeveloperError`。错误指向
  `world.getTerrainHeight`/`pickTerrain`/`SceneGISPlanarTerrainSampler`，但不发明一对一等价承诺。
- `Scene.getHeight/updateHeight` 是 Cesium private lifecycle seam，仍供 Scene 内部 invariants 使用，不列为 planar application API；I4
  不给它们增加可能破坏 `initializeFrame` 的 public-style guard。

### Native effect and constructor safety

- SceneGIS private helper提供 allocation-free `prepareNonGlobeWorld(scene)` 与
  `validateNonGlobeNativeEffects(scene)`：
  - construction-only world install 将 WGS84 自动开启的 `scene.fog.enabled` 归一为 `false`；
  - visible native `scene.skyBox`、`skyAtmosphere`、`sun`、`moon`，`fog.enabled===true` 或
    `shadowMap.enabled===true` 均在 current frame mutation/command/resource execute 前抛英文 `DeveloperError`；
  - defined 但 `show===false` 的 native environment primitive 和 disabled Fog/Shadow 允许存在，不被 SceneGIS 销毁或接管；
  - caller 修正状态后可在下一 frame 正常恢复，旧 planar Environment/Surface resource identity 不变。
- `Scene._initializeWorld` 在 existing SGP-0001 construction seam 内调用 prepare helper；新的 per-frame validation 由 proposed
  `SGP-0007` 在 `Scene.updateFrameState` 最前端调用。不得修改 `Fog.js`、`ShadowMap.js` 或 Environment renderer。
- Direct `CesiumWidget({world})` 与 planar `Viewer({world|planarWorld})` 在 DOM/Scene/World/provider mutation 前执行同一选项 profile：
  - `sceneMode` 只允许 undefined/`SCENE3D`；`scene3DOnly` 只允许 undefined/`true`，non-Globe path 实际传 `true`；
  - `ellipsoid`、`mapProjection`、`mapMode2D`、`depthPlaneEllipsoidOffset` 任何 defined value 拒绝；
  - `shadows` 只允许 undefined/`false`；native `skyBox`/`skyAtmosphere` 只允许 undefined/`false`；
  - 既有 Globe imagery/terrain/widget guard 保持，`world:false`/`globe:false` 不被误判为 planar。
- `CesiumWidget.js` 的构造 guard 继续属于 SGP-0001，`Viewer.js` 继续属于 SGP-0002；不得嵌套 SGP marker。

### Globe-specific Camera boundary

- 在 existing `SceneGISPlanarCamera` helper 中集中一个 side-effect-free globe-only guard；`Camera.js` 继续通过 SGP-0004 窄委托。
- planar Camera 调用 `getRectangleCameraCoordinates`、`pickEllipsoid`、`computeViewRectangle` 时，在参数/result/Camera mutation 前
  同步抛精确英文 `DeveloperError`。Globe 与 `globe:false` Camera 原实现不变。
- `positionCartographic` getter 不改变运行时值，因为 Cesium 通用内部 render state 仍读取它；JSDoc、ADR 与 Guide 必须明确：
  对 planar Camera，它只是当前 Scene ellipsoid 的 internal projection，不是项目 CRS/平面位置，应用必须使用
  `positionWC`/`position`。`Scene.ellipsoid` 同样不是 planar coordinate-system contract。
- Rectangle、Cartographic、Ellipsoid 与 ENU utility 本身保持可用的球面类型，不做 prototype patch、union overload 或值域猜测。

### ADR, SGP, docs, delivery, and example

- 新建 `ADR-0039-planar-scene-api-qualification-and-safety.md`，记录资格矩阵、height alternatives、native-effect双层 guard、
  Camera globe-only boundary、`positionCartographic` internal exception与deferred extensions；修订 ADR-0006 的 Viewer/Widget 选项矩阵。
- 新增 proposed `SGP-0007`，只登记 `Scene.js`、focused Scene API Spec、ADR-0039 与 removal condition。SGP-0001/0002/0004
  在各自既有目的内增加最小选项/Camera guard，不改变 SGP-0003/0005/0006。
- Architecture、DevelopmentGuide、PlanarWorldGuide、UpgradeChecklist 与 installed verifier 同步；兼容矩阵必须区分
  supported、guarded globe-only、internal-only、deferred 四类，不能用“Cesium API 均支持”概括。
- 只修改 `Test/平面API集成.html`：增加中文“Scene API 安全边界”folder，展示 screen transform、pick/depth/terrain query 与
  height/Camera globe-only rejection；不得把 Environment/Surface 功能重新堆入，不通过 render-loop error 演示 native effect guard。

## Affected paths

### Allowed product paths

- `.scenegis/upstream-patches.json`
- `packages/engine/Source/Scene/Scene.js`（upstream-owned；existing SGP-0001 + proposed SGP-0007 only）
- `packages/engine/Source/Scene/Camera.js`（upstream-owned；existing SGP-0004 only）
- `packages/engine/Source/Widget/CesiumWidget.js`（upstream-owned；existing SGP-0001 only）
- `packages/widgets/Source/Viewer/Viewer.js`（upstream-owned；existing SGP-0002 only）
- 新增 `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSceneApi.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`，仅 globe-only public-method guard

### Allowed Specs

- 新增 `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarSceneApiCesiumWidgetSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarCameraCesiumWidgetSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISWorldCesiumWidgetSpec.js`，仅 direct non-Globe constructor preflight
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`，仅 declarative/live Viewer preflight
- 必要时 `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`，只覆盖 new frame-level
  native conflict 与既有 E1-E4 non-regression

### Allowed docs, example, and delivery

- `Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md`
- `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
- `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md`、`PlanarWorldGuide.md`、
  `PlanarWorldUpgradeChecklist.md`
- `Test/平面API集成.html`；严禁读取/修改/暂存 `Test/地形.html`
- `scripts/scenegis/verify-planar-packages.mjs`，仅 installed JSDoc/API/source evidence
- `AgentDocs/planar-api-integration/**` 现有 index/extension/phase/review/handoff

### Forbidden in I4

- `packages/engine/Source/Scene/Picking.js`、`Fog.js`、`ShadowMap.js`、`SceneTransforms.js`、`CameraFlightPath.js`
- SceneGIS World/Environment/Surface/Terrain、renderers、Shader、Worker、ControllerHost、Entity/DataSource helpers
- Globe/Quadtree/3D Tiles/format loaders/clustering、post-process implementation、new public SceneGIS class
- packages/build manifests、gallery/Sandcastle、generated declarations/API/Build/Source outputs
- `AgentDocs/planar-viewer-bootstrap/**` 与项目负责人 `Test/地形.html`

## Steps

1. Execution 重新核对当前 Scene/Camera/Widget/Viewer method entry 与 marker ranges，把 line drift 或必要偏差写入本 plan；不得依赖旧行号。
2. 先新增 ADR-0039 草案、proposed SGP-0007 registration 与 private helper 单元边界，再接入 `Scene.js` supported flags、height guard、
   world prepare 和 frame validation。
3. 扩充 SGP-0001/0002 construction preflight，证明 direct Widget 与 live/declarative Viewer 在 DOM/World mutation 前失败，
   `false` suppression 与 `globe:false` 保持。
4. 在 SGP-0004 既有 Camera seam 中加入三个 globe-only method guard，证明 result/Camera state failure atomic 和 Earth non-regression。
5. 建立 real Context generic API qualification，覆盖两类 representative frustum、screen/drawing buffer、pick/drill/depth、terrain 与 ordinary ray。
6. 更新中文 direct Test、JSDoc/ADR/formal docs/installed verifier，创建 open review request 后停止。Architecture 批准前不请求 manual gate。

## Validation

### Behavior and failure atomicity

- direct `CesiumWidget({world})`、live Viewer、declarative Viewer 覆盖全部 allowed/rejected option values；invalid 构造不增加 DOM child，
  不创建/销毁 World，不建立 controller/provider/Context。
- non-Globe world install 后 `fog.enabled===false`；disabled Fog/Shadow 与 hidden native primitives stable render。
- postconstruction visible native sky/body、Fog 或 Shadow mutation在同一 requested/preRender frame 抛错，且 native update/command、World
  begin/render/environment/end、Surface command/resource counters在失败边界前不发生；修正后下一 frame 可恢复。
- 四个 native height/clamp API在 Picking spy、mostDetailed queue、Promise、input array/result mutation前抛错；supported flags=false。
- 三个 Camera globe-only方法在 result/Camera transform/frustum/requestRender mutation前抛错；Earth Camera返回原有结果。

### Generic Scene qualification

- Perspective 与 Orthographic real Context 中，known planar Cartesian 经 canvas/window/drawing-buffer transforms得到有限且一致的位置；
  result-object identity和device-pixel ratio路径闭环。
- `pick`、`drillPick`、`pickPosition`返回实际 planar object/depth Cartesian；world terrain query与depth Z在已定义容差内一致。
- ordinary ray pick使用world Cartesian ray命中实际 primitive/terrain，调用后default view、Context/frame state可继续render；MostDetailed不作支持声明。
- E1-E4 planar Environment开启时仍正常render；I1 Camera、I2 framing、I3 tracking与warm Surface/Environment identities不受 guard影响。

### Regression and delivery

- Focused SceneGIS SceneApi/Camera/World/Viewer/Environment Specs；必要 upstream aggregates：`Scene/Scene`、`Scene/Camera`、
  `Widget/CesiumWidget`、`Viewer/Viewer`。只运行最小充分集合，Architecture review 不重复 Execution 已提供的用例。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`。
- `node scripts/scenegis/verify-planar-packages.mjs`；只读检查 generated declarations/API，生成输出不得进入 status。
- Direct `Test/平面API集成.html`短浏览器检查；自动化不得依赖公网 tile 成功。
- Changed-scope ESLint/Prettier/Markdownlint、`git diff --check`、official upstream audit、exact status/generated audit。
- Architecture批准后由项目负责人 manual gate：中文 screen/pick/terrain 状态、height/Camera rejection，以及现有 I1-I3 控件无回归。

## Acceptance criteria

- 通用 Cartesian screen/pick API 在平面 real Context 中有明确证据和文档矩阵，不需要平行 SceneGIS facade。
- ellipsoid height/clamp API不再因depth texture错误宣称supported，也不会修改 caller 输入或启动异步operation。
- native Fog/Shadow/Earth environment在 planar/non-Globe world 构造与运行期均不能静默生效；平面 Environment 保持唯一受支持路径。
- Camera Rectangle/Ellipsoid view methods fail-fast；`positionCartographic`/`Scene.ellipsoid`被明确标成internal ellipsoid state而非planar CRS。
- Globe、`globe:false`、generic no-World path及I1-I3 public行为无回归；ADR-0039、ADR-0006、SGP、JSDoc/docs/example/delivery闭环。
- upstream-owned 仅 `Scene.js`、`Camera.js`、`CesiumWidget.js`、`Viewer.js` 四个既有集成文件，generated=0。

## Stop conditions

- 若需要修改 Picking/Fog/ShadowMap/SceneTransforms/CameraFlightPath、World/Environment/Surface、Shader/Worker 或第五个 upstream product
  file，停止并提交源码证据给 Architecture。
- 若 `Camera.positionCartographic` 的运行时 guard 要求改 UniformState/Scene/3D Tiles 等多个内部 consumer，不实施；保持 internal-only
  文档边界并报告。
- 若普通 screen/pick/ray API在 SCENE3D 仍进入 ellipsoid conversion，不复制或 patch Cesium 算法；缩窄资格矩阵并报告。
- 若 native effect guard 无法在 World/frame mutation前成立，不通过自动关闭 caller 显式配置掩盖；先报告事务边界。
- Architecture review、owner manual gate 与独立 checkpoint 完成前不 commit/push，不进入 I5。

## Execution results

### Implementation

- 新增 `_SceneGISPlanarSceneApi`，按 live non-Globe primary World 统一完成 constructor option preflight、world-install Fog
  normalization、frame-start native-effect validation 与 height/clamp guard。没有按 CRS、ellipsoid 或坐标值推断。
- `Scene.js` 通过 proposed `SGP-0007` 接入 supported flags、四个 height/clamp synchronous guards 与 frame-start validation；
  existing `SGP-0001` 只增加 world-install preparation。`Camera.js`、`CesiumWidget.js`、`Viewer.js` 分别只复用
  `SGP-0004`、`SGP-0001`、`SGP-0002` 的既有目的，未嵌套 marker。
- `_SceneGISPlanarCamera` 集中三个 globe-only Camera method guard；`positionCartographic` 与 `Scene.ellipsoid` 保持
  Cesium internal ellipsoid substrate，不伪造 planar 语义。
- Direct Test 新增中文“Scene API 安全边界”folder；installed verifier锁定private hiding、JSDoc/API exception anchors与
  12/12 shader delivery。

### Focused evidence

| Scope                                               | Result                                                    |
| --------------------------------------------------- | --------------------------------------------------------- |
| Scene API real-Context / failure atomicity          | `TOTAL: 3 SUCCESS`                                        |
| direct World constructor profile                    | `TOTAL: 25 SUCCESS`                                       |
| public Camera real-Context guards                   | `TOTAL: 3 SUCCESS`                                        |
| private planar Camera aggregate                     | `TOTAL: 68 SUCCESS`                                       |
| live/declarative Viewer profile                     | `TOTAL: 23 SUCCESS`                                       |
| upstream Camera / CesiumWidget / Scene aggregates   | `241 / 75 / 392 SUCCESS`                                  |
| build / build-release / build-ts / build-docs / tsc | passed                                                    |
| installed package verifier                          | passed; `12/12` GLSL and `12/12` generated shader modules |
| direct Test blocked-network Chromium smoke          | passed; no page/unexpected console errors                 |

Real-Context qualification覆盖Perspective、Orthographic、2x drawing-buffer/CSS transform、terrain depth、ordinary ray、late
preRender native conflict、Fog/Shadow recovery及warm Surface resource identity。既有Content/Viewer evidence继续承担actual
pick/drill object资格，不新增parallel facade或重复矩阵。Direct smoke确认`viewer.planarWorld===world`、
`scene.world===world`、两个height capability flags均为false、中文controls可执行、credit-safe layout与BFCache lifecycle。

### Ownership, deviations, and unrun boundary

- Exact I4 changed paths: `26`；其中upstream-owned=`4`：`Scene.js`、`Camera.js`、`CesiumWidget.js`、`Viewer.js`。
- SGP: proposed `SGP-0007` plus existing-purpose `SGP-0001/0002/0004`；SGP-0003/0005/0006未改写。
- ADR: new proposed `ADR-0039`；amended `ADR-0006`；consumed `ADR-0037`。Public profile/scope deviations: none。
- Official audit passed；generated status=`0`。Architecture-owned `AgentDocs/planar-viewer-bootstrap/**`两处baseline未改动，
  owner `Test/地形.html`未读取、修改或暂存。
- 未运行full suite、E2E、Sandcastle、public-network success、3D Tiles MostDetailed或I5 delivery matrix；均不在I4最小充分边界。
- Review request已创建；phase保持active且未commit/未push。Architecture批准前不请求manual gate、不进入I5。

### I4-R001 execution response

- ADR-0039/I4现明确取代ADR-0036/E4早期允许“planar atmosphere + visible native generic background”的public配置。
  live non-Globe Scene的sky、atmosphere和body仅支持`SceneGISPlanarEnvironment`。
- ADR-0036、Architecture、Guide与UpgradeChecklist已统一：保留的underground opaque-mask branch只属于private defensive
  compatibility seam，不是应用配置或升级承诺；后续可在独立审计证明不可达后移除。
- Finding仅涉及正式文档与I4 AgentDocs；产品、Specs、Test、SGP manifest和generated files均未修改。按review边界只运行affected
  docs Prettier/Markdownlint与`git diff --check`。
- I4-R001已addressed，等待Architecture focused re-review；manual gate仍未请求，working tree未commit/未push，未进入I5。

### Architecture approval and manual gate

- Architecture focused re-review已关闭I4-R001；Architecture/code review=`approved`，未发现其他blocking finding。
- Phase保持active并进入`manual-gate-pending`。项目负责人需在`Test/平面API集成.html`验收中文Scene API状态、
  screen/window/drawing-buffer与terrain/depth结果、globe-only rejection、I1-I3 controls non-regression及compact credit-safe layout。
- Owner通过前不commit、不push、不进入I5。

### Owner manual gate

- 项目负责人已在`Test/平面API集成.html`完成I4人工验收并明确通过：中文Scene API安全边界、
  screen/window/drawing-buffer与terrain/depth状态、height/clamp和Camera globe-only拒绝后的页面恢复、I1-I3
  Camera/framing/tracking non-regression及compact panel/Credit均已确认。
- Architecture已创建I4独立本地checkpoint `22bd7e1c29`（`实现平面 Scene API 安全边界`，not pushed）。I4 completed；
  当前状态回写等待Architecture amend进同一checkpoint，I5尚未进入。
