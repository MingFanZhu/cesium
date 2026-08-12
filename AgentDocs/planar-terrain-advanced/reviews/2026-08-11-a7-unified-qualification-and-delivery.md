# Review: A7 平面高级地形统一资格与交付

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: Architecture Agent
- Created: `2026-08-11`
- Updated: `2026-08-12`
- Review target: `feature/planar-terrain-advanced` complete working-tree diff relative to
  `a0b412a7d2234d4247601c3e0e798ddd91f294c8`
- Related plan:
  [A7 phase plan](../plans/2026-08-11-phase-a7-unified-qualification-and-delivery.md)
- Related decisions: ADR-0024～ADR-0029；A7不新增ADR或改变公共契约

## Scope

- Review the single local real-Context qualification that joins LERC/Heightmap and Quantized providers through the
  existing Worker, Surface, imagery, depth, navigation, lighting and lifecycle paths.
- Review the exact 30-frame warm signatures, three bounded churn rounds, provider replacement and resource balance.
- Review the test-only terrain-navigation readiness correction exposed by asynchronous Worker completion.
- Review release/type/docs/package/Sandcastle evidence, durable delivery wording, zero-upstream/zero-SGP ownership and
  the still-open project-owner manual gate.

## Implementation summary

A7 initially added one direct qualification case and no product runtime code. The case uses the repository's local 257×257 LERC
tile through `SceneGISPlanarUrlTemplateHeightmapTerrainProvider`, the real terrain TaskProcessor Worker and a real
Context. In the same World it executes representative pan/rotate/wheel, surface clearance, underground bidirectional
orbit, local imagery, depth/query/Z=0 separation and unlit/smooth lighting, then replaces the caller-owned provider with
the repository's local Quantized-mesh tile.

Both formats run 30 stable warm frames. Command, VA, shader, terrain task and persistent GPU/resource counters remain
unchanged after convergence, and final destroy balances position/normal/index buffers, VAs and shared/owned index
references. Three bounded churn rounds reconverge without Home. Advisory timing is recorded without an automated
threshold.

The qualification exposed one test-only reliability issue: the existing terrain-navigation real-Context Spec assumed
that eight synchronous render calls implied Worker completion. It now uses the repository's bounded `pollToPromise`
readiness seam. A7-R001 later adds one private Surface shader correction: smooth normals retain their Worker topology-up
orientation, while derivative normals are oriented to the transformed planar `+Z` hemisphere rather than the camera.
A7-R002 then corrects the existing Worker normal metric and private smooth shader transform without changing positions,
mesh topology, transfer shape, terrain runtime or public API. There is no controller or upstream-owned product change.

## Review targets

| Area                  | Paths                                                                                     | Expected evidence                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unified qualification | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualificationSpec.js` | real Worker/provider replacement, navigation/lighting/depth, 30+30 warm, 3 churn, destroy balance |
| A7-R001 shader fix    | `_SceneGISPlanarSurfaceShader.js` + existing Shader/terrain Widget Specs                  | stable topology-up/+Z Lambert normal and same-point above/below real-Context pixel evidence       |
| A7-R002 normal metric | terrain Worker tasks + smooth shader + existing Worker/qualification Specs                | meter-metric world-axis normals and large-extent coherent lighting                                |
| Test correction       | existing `SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js`                             | asynchronous Worker readiness rather than fixed frame count                                       |
| Sandcastle            | existing `scenegis-planar-terrain/sandcastle.yaml`                                        | smooth/geometric wording, same single demo and best-effort public boundary                        |
| Durable docs          | `PlanarWorldGuide.md`, `PlanarWorldUpgradeChecklist.md`                                   | current A7 qualification and upgrade boundary                                                     |
| AgentDocs             | A7 phase/extension/index/review                                                           | exact counts, commands, ownership, deviation and manual gate                                      |

## Validation evidence

- Direct new cases: `1`. Focused aggregate: `59/59` with no overlap:
  A7 qualification `1/1`, Worker `8/8`, terrain Widget `2/2`, terrain-navigation Widget `1/1`, Controller
  `47/47`.
- The unified case proves local LERC decode and both mesh topologies use the real Worker; one imagery binding and one
  command per actual tile; finite changed smooth-lit pixels; resident/depth/terrain queries; public mathematical pick
  remains Z=0; surface and underground inputs do not invoke Home.
- Heightmap 30-frame warm median/P95: `0.400/0.600 ms`; Quantized: `0.300/0.500 ms` on Chrome 151 / Windows 10.
  These coarse-resolution figures are advisory only. The hard assertions are reference/counter/readiness convergence.
- Provider replacement makes `tilesLoaded=false`, discards old VAs, converges to Quantized owned-index content and
  leaves both providers caller-owned. Destroyed buffers/VAs/indices and shared references equal their created/acquired
  counters exactly.
- `npm run build`, `build-release`, `build-ts`, `build-docs`, `tsc`: Exit 0. `build-ts` emits only the
  repository's pre-existing TSD-JSDoc warnings.
- Installed package verifier: Exit 0; public inventory remains engine/widgets/root `26/2/28`, Worker
  source/dev/release/tar and ESM/CJS/private/broken-entry checks pass.
- Gallery no-embedding discovery: Exit 0, 307 examples. Sandcastle no-embedding build: Exit 0, with only existing
  plugin-timing and chunk-size warnings.
- Scoped ESLint/Prettier/Markdownlint, `git diff --check` and official upstream audit: Exit 0.
- A7-R001 focused runs: Shader `4/4`; Surface aggregate `34/34` including those Shader cases; terrain Widget `2/2`;
  A7 qualification `1/1`. No new `it` was added; two Shader cases and one terrain Widget case gained direct assertions.
  The real-Context case samples the same non-flat terrain point above and below: each averaged RGBA component differs by
  at most `8`, while DrawCommand, shader program and terrain debug/resource identities remain unchanged.

## Ownership audit

- Product runtime delta: SceneGIS-owned terrain Worker normal metric plus private Surface shader transform corrections.
- Upstream-owned product/test/build files: `0`.
- A7 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002: unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated files in status: `0`.
- Public API/export/type inventory: unchanged at `26/2/28`.

## Findings

Architecture首轮自动化review未发现finding。Reviewer独立复跑A7 qualification `1/1`、terrain-navigation Widget
`1/1`、`git diff --check`与official upstream audit，结果均为Exit 0。

| ID      | Severity | Status | Finding                                                 |
| ------- | -------- | ------ | ------------------------------------------------------- |
| A7-R001 | high     | fixed  | 地下观察时光照法线随观察侧翻转                          |
| A7-R002 | high     | fixed  | EPSG:3857 大尺度地形开启 smooth lighting 后出现密集噪点 |

A7-R001由项目负责人人工验收稳定复现：开启Lighting后，地下观察同一非平坦地形出现大面积黑暗碎块，关闭Lighting
立即恢复。Execution已在`_SceneGISPlanarSurfaceShader.js`移除camera-facing `faceforward`：smooth保持Worker
topology-up normal；geometric fallback以`czm_normal * +Z`显式修正derivative winding，不使用`abs(dot)`。
Shader/Surface `34/34`、terrain Widget `2/2`、qualification `1/1`通过；同一坡面点上下观察RGBA每分量差
`<=8`，command/shader/terrain resource identity不变。Architecture独立复跑Shader `4/4`、terrain Widget `2/2`、
diff check与official audit后确认关闭。

A7-R002由项目负责人在现有`scenegis-planar-terrain`公开EPSG:3857/LERC案例中复现：Surface视角开启
Lighting后整幅地形出现密集黑色/彩色噪点，关闭Lighting后同一影像立即恢复，故并非imagery或underground
问题。Architecture在当前页面复现并审计法线链路：Worker用tile unit-local XY与meter Z计算normal，随后先以
`Uint8x2` oct量化；tile model matrix再把XY放大到EPSG:3857米制尺度，而shader以`czm_normal`应用非均匀
inverse-transpose。该顺序会使真实world-space坡度分量在量化前过小，并在shader中被大尺度变换放大为噪声。
Execution必须先用deterministic大extent fixture验证该根因，再把normal计算/编码和shader变换统一到真实平面米制
坐标空间；若验证不成立则停止并回报新的源码事实。A7-R001的稳定朝向修复继续保留。

Execution已用两个40075016.68557849米extent的deterministic plane fixture确认根因：旧unit-local normal与
analytic world-space normal方向显著不同，且oct量化发生在非均匀model transform之前。修复后Heightmap与Quantized
task都以extent width/height恢复meter XY delta再累计normal；oct stream定义为fixed planar world-axis，smooth vertex
shader改用`czm_viewRotation`，不再使用含model inverse scale的`czm_normal`。Worker `8/8`中两个topology的decoded
normal与analytic方向dot均`>0.9999`，caller-owned inputs不变；Surface `34/34`、terrain Widget `2/2`、A7
qualification `1/1`通过。大extent qualification的lit frame以四邻域median检测孤立亮度差`>48`，outlier count
`<=8`，同时保持smooth mode、command/VA/shader warm identity、imagery/depth与destroy balance。Architecture独立
复跑Worker `8/8`、Surface/Shader `34/34`、terrain Widget `2/2`、A7 qualification `1/1`与build/static/audit，
全部通过并确认finding关闭。项目负责人随后在公开EPSG:3857/LERC Sandcastle目视确认Lighting正确。

## Remaining risks and manual gate

- The direct qualification intentionally keeps one Level-0 actual cover. Expanding the 257×257 LERC tile into four
  Level-1 fallback meshes exceeded the bounded qualification cost; multi-level/four-child/upsample behavior remains
  covered by the existing terrain focused suites. Architecture接受该证据拆分：A7负责两种provider/Worker/runtime的
  unified delivery closure，既有terrain suites继续负责multi-level topology与fallback状态机。
- Timing uses a coarse browser clock and must not be treated as a cross-machine gate.
- Public OSM/LERC availability, credits, console, Mountain/LOD movement, Lighting, surface gestures/clearance,
  underground above/below/crossing and Home mode preservation已由项目负责人完成本次真实浏览器/GPU人工验收；公网服务
  后续可用性仍属于best-effort外部风险。
- A7-R001现有自动化已补同一点上下观察的稳定lit pixel证据并通过Architecture focused re-review。
- A7-R002的米制normal与大extent真实Context证据已由Execution补齐，并经Architecture focused re-review与项目负责人
  公开Sandcastle复测关闭。

## Conclusion

`approved`。A7-R001/R002均已关闭；Worker normal采用真实meter metric与fixed planar world axes，smooth shader以
`czm_viewRotation`完成world-to-eye变换。Architecture focused矩阵、build/static/audit及项目负责人公开Sandcastle
人工验收全部通过。Upstream-owned files=`0`，A7 SGP=`0`；A7与extension可标记`completed`并形成独立本地提交。
