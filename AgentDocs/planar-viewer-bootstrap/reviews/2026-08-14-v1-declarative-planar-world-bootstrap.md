# Review: V1 Declarative Planar World Bootstrap

## Metadata

- Review type: `implementation`
- Status: `approved`
- Extension: `planar-viewer-bootstrap`
- Phase: `V1 Declarative Planar World Bootstrap`
- Author role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-14`
- Base commit: `685a3bb06e54243706e1b73caef5833d48bdf197`
- Branch: `feature/planar-viewer-bootstrap`
- Phase plan:
  `../plans/2026-08-14-phase-v1-declarative-planar-world-bootstrap.md`
- ADR: amended `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
- SGP: reused `SGP-0002`

## Review target

V1增加`Viewer({planarWorld})`声明式入口、readonly resolved `viewer.planarWorld`、SceneGIS-owned三级对象
bootstrap helper，并把直连环境示例迁移到Viewer。Review重点是pre-DOM failure boundary、existing live-world/Globe
compatibility、resolved identity、controller/World ownership、public delivery和唯一upstream seam。

## Implementation summary

- 新增private `_SceneGISPlanarViewerBootstrap`。它只验证config为non-null non-array object，然后把raw extent、CRS和
  World字段转发给三个public constructors；不访问DOM/Context/provider，也不保留config引用。
- `Viewer.js`在child DOM前区分live `world`与raw `planarWorld`，先验证完整planar option matrix和互斥，再创建单一
  resolved World。CesiumWidget forwarding、camera controller和instance publication只消费该local reference。
- 新增`Viewer.PlanarExtentOptions`、`Viewer.PlanarWorldOptions`和readonly `viewer.planarWorld` JSDoc；live-world与
  declarative入口均满足`viewer.planarWorld === viewer.scene.world`，Globe/`globe:false`返回`undefined`。
- `Test/平面环境.html`改用声明式EPSG:3857 Viewer，返回后再基于resolved tiling scheme安装OSM/Esri providers；不再
  手工创建Extent/CoordinateSystem/World/CameraController，也不再手工remove Viewer-owned controller。
- installed verifier锁定widgets/root ESM/CJS Viewer export、两个typedef、constructor option、getter与API HTML anchor。

## Exact changed paths

Product/spec/example/delivery:

- `packages/widgets/Source/Viewer/Viewer.js`
- `packages/widgets/Source/SceneGIS/_SceneGISPlanarViewerBootstrap.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`
- `Test/平面环境.html`
- `scripts/scenegis/verify-planar-packages.mjs`

Formal docs:

- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`

AgentDocs assignment baseline and writeback:

- `AgentDocs/planar-viewer-bootstrap/README.md`
- `AgentDocs/planar-viewer-bootstrap/discussions/README.md`
- `AgentDocs/planar-viewer-bootstrap/plans/README.md`
- `AgentDocs/planar-viewer-bootstrap/plans/2026-08-14-planar-viewer-bootstrap-extension.md`
- `AgentDocs/planar-viewer-bootstrap/plans/2026-08-14-phase-v1-declarative-planar-world-bootstrap.md`
- `AgentDocs/planar-viewer-bootstrap/reviews/README.md`
- `AgentDocs/planar-viewer-bootstrap/reviews/2026-08-14-v1-declarative-planar-world-bootstrap.md`

Total: 17 paths。项目负责人自有untracked `Test/地形.html`未读取、未修改、未暂存。

## Validation evidence

### Focused behavior

- `npm run test -- --includeName "SceneGIS/SceneGISPlanarViewer"`
  - exit 0；`TOTAL: 20 SUCCESS`。
  - 新增raw config创建/快照、invalid config与world/planarWorld/globe互斥的pre-DOM/pre-controller闭环。
  - 复用同一aggregate证明live-world、Globe、`globe:false`、controller/Home、tracking guards、rollback、destroy、
    imagery render与warm path未回归。

### Public build and installed delivery

- `npm run build`：passed。
- `npm run build-release`：passed。
- `npm run build-ts`：passed；保留既有TSD-JSDoc warnings，无V1 failure。
- `npm run build-docs`：passed。
- `npm run tsc`：passed。
- `node scripts/scenegis/verify-planar-packages.mjs`：passed；12/12 GLSL、12/12 generated modules、bare
  ESM/CJS、V1 Viewer declarations/API及既有delivery fixtures闭环。

### Direct browser

使用已运行的root server `http://localhost:8080/Test/平面环境.html`，未启动/停止外部服务：

- resolved World identity、EPSG:3857 extent、maximumLevel=16、Viewer-owned controller identity、legacy inputs=false、
  Environment/World identity和caller SkyBox均正确；无console error/warning。
- 实际canvas wheel与left drag均改变planar camera；中文lil-gui Home返回finite、extent内的全域pose。
- 公开OSM/Esri provider在本次环境settled；该公网成功仅为best-effort evidence，不是自动化gate。
- compact viewport下panel为scroll-capable且不与credit重叠。
- synthetic `PageTransitionEvent`边界：persisted pagehide保留Viewer/World/Environment/controller/SkyBox/gui及aggregator
  identity；随后non-persisted pagehide销毁Viewer/World/SkyBox与aggregator并清空所有diagnostic refs。

### Static and ownership

- Changed-scope ESLint：passed。
- Changed-scope Prettier、formal/AgentDocs Markdownlint、AgentDocs explicit Prettier：passed。
- `git diff --check`：passed；只有Windows checkout的LF→CRLF notice。
- `node scripts/scenegis/audit-upstream-patches.mjs`：passed；current delivery upstream-owned entries=1，唯一
  `packages/widgets/Source/Viewer/Viewer.js`；复用`SGP-0002` paired markers；generated status=0。

## Deviations and risks

- Implementation deviations: None。
- 不新增helper独立Spec；public Viewer aggregate直接覆盖helper success/failure、identity与failure timing，避免重复入口。
- Viewer constructor不是任意外部WebGL失败的全局transaction；V1只冻结confirmed deterministic config/option preflight和
  既有controller rollback。
- 公网provider保持best-effort。manual gate仍需项目负责人确认中文panel、交互和公开数据fallback视觉。

## Findings

- Architecture/code review未发现需要返工的finding。

## Architecture disposition

- `Viewer.js`的声明式入口、resolved local forwarding、readonly getter与既有controller/World teardown保持同一
  `SGP-0002`能力边界；没有增加第二个World或Controller，也没有改变Globe/`globe:false`路径。
- `_SceneGISPlanarViewerBootstrap`只验证顶层config shape并把字段转发给三个public constructors；不访问DOM、Context、
  provider或network。生成JS barrel中的underscore导出属于既有soft-private规则，declarations/API HTML未公开该helper。
- invalid raw config和planar-incompatible option在child DOM前失败；成功后live-world与声明式入口均满足
  `viewer.planarWorld === viewer.scene.world`，并继续由Scene exactly-once拥有和销毁。
- focused Specs、public build/types/docs、installed delivery、direct browser evidence与official audit足以覆盖V1风险；Architecture
  未重复执行Execution已经通过的长构建或浏览器矩阵。
- Architecture/code review批准。V1仍保持active，等待项目负责人对`Test/平面环境.html`的声明式Viewer、平面相机、中文面板和
  public-data fallback完成人工验收；人工gate通过前不得commit或进入V2。

## Manual gate

- 项目负责人于`2026-08-14`在root development server的`Test/平面环境.html`完成V1人工验收并确认通过。
- 验收范围包括声明式`Viewer({planarWorld})`启动、平面相机交互/Home、中文lil-gui及公开影像/地形best-effort表现。
- V1 Architecture/code、automated delivery与manual gate全部关闭，可以创建独立本地checkpoint；V2仍需在checkpoint后重新审计
  Cesium public API并建立confirmed phase plan。

## Requested disposition

Architecture/code review与项目负责人人工验收均已通过。下一步由Architecture创建V1独立本地checkpoint，再重新发现并建立V2
phase plan。当前未push、未进入V2。
