# Review: C11 Planar Depth/Stencil Ground Rendering

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-10`
- Updated: `2026-08-10`
- Review target: complete `feature/planar-content` working-tree diff after base
  `c376e82c7e8787be336ccfea3d4480d99a2c15da`
- Related plan:
  [C11 planar depth/stencil ground rendering](../plans/2026-08-10-phase-c11-planar-depth-stencil-ground-rendering.md)
- Related decision:
  [ADR-0023](../../../Documentation/SceneGIS/Decisions/ADR-0023-planar-depth-stencil-ground-rendering.md)

## Scope

- Review the single SceneGIS-owned GPU area/line backend and confirm no C9 actual-mesh fallback remains.
- Review `Pass.GLOBE -> Pass.TERRAIN_CLASSIFICATION` normal/pick/depth ordering, exact Surface command replay, z-fail
  stencil cleanup and ground pick identity.
- Review public Ground Primitive contraction, Entity allowlist/fail-fast rules, provider envelope updates, single-Context
  and exactly-once resource lifecycle.
- Confirm C9 runtime deletion, delivery migration, public/private generation boundary, upstream-owned files=`0`, C11
  SGP=`0`, generated status=`0` and project-owner manual acceptance closure.

## Implementation summary

- Planar Surface commands now use`Pass.GLOBE`; generic pick and pick+depth replay the most recent normal Surface command
  references without selection or allocation.
- Stable polygon shadow volumes and polyline segment volumes feed a private z-fail stencil/classification command runtime.
  Height envelope changes only update transform/bounds; terrain LOD/revision/camera never rebuild footprint GPU resources.
- Public Ground Primitive now means implicit surface clamp for one polyline or non-extruded polygon. Legacy ground
  HeightReference options are removed, stencil support is checked before mutation, and the existing attributes,
  candidate/current and lifecycle contracts remain.
- `_SceneGISPlanarGroundDraper`, Surface ground snapshot/signature and World late ground queue are deleted. Existing
  qualification, E2E, Sandcastle and package smoke were migrated in place.

## Validation evidence

- Focused suites: GroundVolume `3/3`; GroundPrimitive `5/5`; Polyline `7/7`; Polygon `7/7`; Area `6/6`; Route `6/6`;
  Surface/Shader aggregate `32/32`; World `20/20`; Qualification `4/4`; content Widget `4/4`.
- Architecture focused rerun: Surface/Shader `32/32` and GroundPrimitive `5/5` passed. GroundVolume was actually
  `1/3`: both polygon cases were routed into `createPolylineVolume` because the private Spec mixed generated-barrel
  public constructors with a direct-source private helper import. The submitted GroundVolume `3/3` claim is therefore
  not accepted yet.
- Representative regressions: P1 World Widget `16/16`; terrain Widget `1/1`; imagery Widget `9/9`; navigation Widget
  `4/4`; upstream CesiumWidget `75/75` including default Globe and `globe:false`.
- Builds: `build`, `build-release`, `build-ts`, `build-docs`, `tsc` all Exit `0`; only existing TSD-JSDoc warnings.
- Content E2E: standard runner recorded `EADDRINUSE` for preserved user port `8081`; C10-equivalent local dev/release runs
  each passed `1/1`. Installed-package smoke passed. Sandcastle/gallery no-embedding passed; gallery processed `307`
  examples with existing Vite warnings.
- Generated declaration/API checks show the contracted public type and no old HeightReference fields; GroundCommands,
  GroundLineShader, GroundVolume and deleted GroundDraper private names have zero declaration/API hits.

## Ownership audit

- Upstream-owned files changed: `0`.
- C11 SGP: `0`; `.scenegis/upstream-patches.json`, SGP-0001/0002 hunks and upstream product files unchanged.
- New `SCENEGIS_PATCH` markers: `0`; generated files in status: `0`.
- Upstream-inspired private implementation cites exact source paths, upstream baseline
  `6d5d8b1f0725b6f831b336463f4b11c98023427b` and upgrade sync conditions.

## Findings

| ID       | Severity | Status | Owner role | Location                                                                                                                                                       | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Required disposition / evidence                                                                                                                                                                                                                                                                                                                                             |
| -------- | -------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-R001 | high     | fixed  | execution  | `_SceneGISPlanarGroundCommands.js` `colorRenderStateOptions`；`_SceneGISPlanarGroundLineShader.js`；polygon internal Appearance shader                         | 当前z-fail volume没有满足相机位于volume内部或volume穿越near/far plane时的closed-volume条件。Color pass启用了back-face culling，而Cesium `ClassificationPrimitive.getColorRenderState`不启用cull；相机处于global height envelope内部时，closed volume可见面全为back face，classification color会消失。area的standard shader与line private shader又都直接写普通`gl_Position`，且fragment没有`czm_writeDepthClamp()`；near/far裁剪会把shadow volume切开，使color与pick所依赖的z-fail计数失效。现有“below”fixture把相机放在无provider envelope `[-1, 1]`之外，不能覆盖地下模式所需的inside-volume视角。 | Execution：color pass关闭face culling，area/line VS/FS采用`czm_depthClamp`/`czm_writeDepthClamp`。Surface real-Context fixture使用`[-80,80]` provider envelope、Z=0实际surface和位于envelope内的Z=-64相机，above/below/orthographic/side的area/line pixel与pick均通过；Surface aggregate `32/32`。                                                                          |
| C11-R002 | high     | fixed  | execution  | `_SceneGISPlanarGroundCommands.js` `updateAndQueue` lines 138-155；`Scene.executeCommand` / `DerivedCommand.getDepthOnlyRenderState` interaction               | `frameState.passes.depth`当前会提交stencil和color两个classification commands。Scene为两者创建depth-only derived command，而`getDepthOnlyRenderState`强制`depthMask=true`；尤其color command继承`depthTest.enabled=false`，会在Surface `Pass.GLOBE` depth之后写入shadow-volume face depth，而不是被分类的planar surface depth。这直接违反ADR-0023“color/pick不写surface depth、`pickPosition`继续返回surface”的契约。现有普通`scene.pickPosition`闭环没有直接锁定该pick+depth command path。                                                                                                         | Execution：ground runtime只在normal render或generic pick排command；`passes.pick && passes.depth`提交ground command=`0`。GroundPrimitive command Spec锁定depth pass零提交；Surface用command-reference filter锁定`scene.pickPosition`期间ground execution=`0`，并在provider envelope与实际surface高度不同的fixture中闭环surface Z，generic pick仍返回original id。            |
| C11-R003 | high     | fixed  | execution  | `SceneGISPlanarGroundPrimitive.js` `createCandidate` lines 181-217；`_SceneGISPlanarGroundLineShader.js` fragment；Polyline/Area/Route visualizer `applyState` | Ground polyline在candidate创建时把caller-owned Color material一次性快照为instance attribute；后续Entity visualizer只修改外部`appearance.material.uniforms.color`，internal current既不读该uniform也不更新attribute，因此ready后的动态line/outline颜色不会出现在画面中。与此同时area standard fragment和line fragment都把未premultiply的Color交给`PRE_MULTIPLIED_ALPHA_BLEND`，透明Color会产生错误合成；Cesium classification shader明确在该blend前执行`rgb *= alpha`。                                                                                                                              | Execution：normal render把caller material Color按值同步到ready current instance attribute，只有bytes变化才写attribute；area/line fragment在blend前premultiply。Real Context由red切到blue alpha=0.5后得到`[0,0,128,255]`，pick id保持，current/VA/Shader/DrawCommand refs不变。                                                                                              |
| C11-R004 | high     | fixed  | execution  | `_SceneGISPlanarGroundVolume.js` `createPolylineVolume` lines 87-132；`_SceneGISPlanarGroundLineShader.js`                                                     | Polyline volume只是为每个segment生成一个独立8-vertex box，attribute只有当前/相对endpoint与左右expand direction；shader也只把每段扩成butt-ended screen-space rectangle，没有previous/next direction、join plane、end plane或等价clip数据。因此普通折线拐角会产生外侧缺口/内侧重叠，闭环处也没有稳定join；现有turn/loop Spec只检查数组finite/non-empty，不能证明ADR-0023承诺的“join/end clipping”和public Polyline视觉语义。                                                                                                                                                                          | Execution：volume为每个endpoint编码previous/next与expand side，并采用Cesium GroundPolyline-inspired inside-out closed segment winding；shader计算screen-space miter，首尾使用end plane语义，closed route wrap邻点。CPU Spec锁定turn共享neighbor triples与loop closure；real Context锁定non-axis turn和closed-loop closure pixel/pick。GroundVolume `3/3`、Surface `32/32`。 |

上述finding均可在已批准的SceneGIS-owned C11路径内修复；不批准新增upstream-owned file、SGP、Scene pass、C9
fallback或第二套ground backend。验证保持focused，不要求重复C11已通过的build/package/E2E全矩阵。

### C11-R005 focused follow-up

- Severity: `medium`; Status: `fixed`; Owner role: `execution`.
- Architecture rerun gets GroundVolume `1/3`: `SceneGISPlanarGroundVolumeSpec.js` mixes generated-barrel public
  constructors with a direct-source private helper, so both polygon cases enter the polyline builder. Use
  direct-source imports consistently and restore `3/3`.
- The turn and loop GPU checks sample only source joint centers, which the old butt-segment implementation can also
  color. Add one outer-miter and one loop-seam off-center pixel/pick assertion that distinguishes the new path.
- No product change is required unless the focused assertion exposes a defect.
- Execution disposition: all public Geometry imports now use direct source modules, matching the directly imported private
  GroundVolume module. The exact requested command now reports GroundVolume `3/3`. Surface adds off-center
  outer-miter `(-30, 38)` and closed-loop seam `(28, -64)` pixel/pick samples; both distinguish the miter fill from the
  old butt-ended segments and pass in Surface/Shader `32/32`. No product source changed for C11-R005.

### C11-R006 project-owner manual finding

- Severity: `high`; Status: `closed`; Owner role: `execution`.
- The project owner reproduced a view-dependent wedge/spike and width change on the magenta `directGround` straight
  polyline in the content Sandcastle while changing heading and pitch. The accepted R004 center-joint fixtures did not
  cover this single-segment failure. The cause was the private line vertex shader expanding top and bottom vertices
  independently in clip/NDC space; that deformation did not preserve a common closed start/end/right-plane family for
  z-fail stencil under oblique perspective views.
- Execution replaced the NDC deformation with a coordinate-neutral eye-space plane expansion. Route directions and
  miters remain tile-local FLOAT values, the footprint position remains RTE high/low, and `czm_metersPerPixel` converts
  the requested pixel width at each eye-space volume vertex. Top/bottom, join and end faces therefore remain one closed
  volume while preserving the public width and the single GPU backend.
- Direct evidence: the Surface real-Context fixture now checks the straight line at three cross-sections (both near-end
  regions and center), with inside/outside width pixels and original id, under high nadir, two oblique headings, reverse
  heading, orthographic and envelope-inside below-surface perspective cameras. It also preserves current/VA/shader/
  command identity and proves `pickPosition` executes zero ground refs. A separate `EPSG:3857` large-offset fixture
  repeats high/oblique/reverse/orthographic pixel, id and warm-identity checks. Turn outer-miter and closed-loop seam
  evidence remains. Surface/Shader now passes `33/33`; GroundVolume `3/3` and GroundPrimitive `5/5` pass.
- Focused regressions pass: Polyline `7/7`, Polygon `7/7`, Area `6/6`, Route `6/6`. `npm run build`, changed-scope
  ESLint/Prettier, affected Markdown Prettier/Markdownlint, `git diff --check` and the official upstream audit are Exit
  `0`; the audit reports current-delivery upstream-owned files=`0`, C11 SGP=`0` and generated status=`0`.

## Architecture diagnostics

- 当前Cesium `ClassificationPrimitive`的color render state不启用face culling；`ShadowVolumeAppearanceVS`与
  `PolylineShadowVolumeVS`使用`czm_depthClamp`，对应fragment使用`czm_writeDepthClamp`。C11仅复用了stencil state
  外形，没有复用这些保证z-fail volume在frustum裁剪下闭合的必要shader协议。
- `Scene.updateDerivedCommands`会为所有非`pickOnly` command创建depth derived command；
  `DerivedCommand.getDepthOnlyRenderState`保留原render state但强制`depthMask=true`。因此C11在`passes.depth`显式排入
  color/stencil commands不是无害重提。
- `SceneGISPlanarGroundPrimitive.createCandidate`把line Color复制到内部attribute后，后续public/Entity material mutation
  没有任何data-flow到该attribute；现有Polyline warm Spec只检查外部Appearance对象，不进入Ground current。
- Polyline volume每段独立构造，源码中没有join/end-plane attribute或fragment clipping；现有结构Spec无法替代拐角像素证据。

## Requested decision

Execution requests focused Architecture re-review of C11-R006. C11-R001 through C11-R005 remain closed, while the C11
phase and extension stay `active`; no commit, push, resumed manual acceptance or next phase is authorized before the
focused decision.

## Architecture focused re-review

- Confirmed color-pass culling is disabled and both area/line shader pairs use `czm_depthClamp` plus
  `czm_writeDepthClamp`; the provider-envelope inside-camera fixture passes in Surface `32/32`.
- Confirmed ground commands are absent from pick+depth while generic pick remains separate; command-reference filtering
  and terrain-surface `pickPosition` closure pass.
- Confirmed ready polyline Color is synchronized by value to the current instance attribute only when bytes change;
  premultiplied output, pixel change, pick id and current/VA/Shader/command identity pass.
- Confirmed previous/next data, closed-route wrap and miter calculation exist in product source, closing C11-R004.
  C11-R005 recorded the remaining evidence defect: GroundVolume independently failed `2/3`, and the original centerline
  GPU samples did not detect the outer-corner gap.

## Architecture final focused re-review

- Confirmed the private GroundVolume Spec now uses direct source imports consistently; independent exact rerun passed
  `3/3` with both polygon cases entering the correct builder.
- Confirmed the new `(-30, 38)` outer-miter and `(28, -64)` closed-seam samples lie beyond both old butt-ended segment
  caps. Independent Surface/Shader rerun passed `32/32`, including pixel color and original pick id at both positions.
- C11-R005 changed only Specs and AgentDocs. Focused Prettier/Markdownlint, `git diff --check` and the official upstream
  audit pass; upstream-owned files=`0`, C11 SGP=`0`, generated status=`0`.

## Architecture C11-R006 focused re-review

- Confirmed the product shader no longer deforms top and bottom volume vertices independently in NDC/clip space. The
  footprint remains RTE high/low, route directions remain origin-local, and both height faces use the same transformed
  miter/right-plane family with eye-space `czm_metersPerPixel` expansion.
- Independently reran the Surface/Shader focused suite: `33/33`, Exit `0`. The straight-line fixtures cover ordinary and
  EPSG:3857 coordinates across perspective, orthographic, above, below, oblique and reverse views while preserving
  current/VA/shader/command identity, original id and the zero-ground-command `pickPosition` path.
- Reloaded the updated content Sandcastle and repeated the original `Ground / Direct` inspection with the baseline view
  plus middle-drag oblique and reverse views. The magenta direct ground line retained a regular band and stable ends; the
  previously reproduced wedge/spike did not recur. This is reviewer diagnostic evidence and does not replace the project
  owner's manual acceptance gate.
- No new finding was introduced. C11-R006 is closed and this review returns to `approved`; C11 and the extension remain
  `active` only for the project-owner manual retest and the subsequent Architecture commit checkpoint.

## Remaining risks and gates

- Project-owner browser/GPU inspection found C11-R007 after the R006 retest; it cannot be replaced by automation.
  Architecture focused re-review is complete, but the subsequent project-owner manual retest remains required.
- C11-R001 through C11-R008 are closed.
- Ordered ground layers, arbitrary Material, extrusion and 3D Tiles classification remain explicitly unsupported.
- C11 and the extension remain `active`; no commit, push or next phase is authorized before manual acceptance.

## C11-R007 project-owner manual finding

- Severity: `high`; Status: `fixed`; Owner role: `execution`.
- Finding: selecting the DEEPSKYBLUE clamped Corridor returned the original Entity, but Viewer placed the green
  SelectionIndicator at the public GroundPrimitive sphere center derived from the asymmetric provider shadow envelope
  `[-450, 8700]`, approximately Z=`4125`, far above the rendered terrain surface.
- Disposition: command/culling continues to use the conservative shadow-volume sphere. Public/Entity presentation
  bounds now use the last-successful source footprint XY center and resident-only `world.getTerrainHeight`; undefined
  and detached-provider queries fall back to Z=0. Radius remains conservative over the padded provider envelope.
  Provider/resident changes update only the queried presentation sphere; footprint current, VA, Shader and DrawCommand
  identities remain stable. Candidate failure retains the last-successful presentation bounds.
- Evidence: direct GroundPrimitive `6/6` covers the asymmetric envelope, resident `37 -> 64`, undefined/detach fallback,
  conservative radius, GPU identities and existing candidate atomicity. Polyline visualizer `7/7` follows revised
  presentation Z. Widgets Viewer `3/3` selects an oblique clamped Corridor, preserves the original Entity and places the
  SelectionIndicator at the same finite terrain-surface world/window anchor rather than the envelope midpoint.

## C11-R007 Architecture focused re-review

- Architecture confirmed that public/Entity bounds use only the last-successful presentation footprint while the
  internal Cesium Primitive retains the shadow-volume Geometry and model matrix used for command culling.
- Resident-height, fallback, provider-detach, conservative-radius and candidate-failure behavior are covered without
  replacing current/VA/Shader/DrawCommand identities.
- Architecture independently reran GroundPrimitive `6/6` and Widgets Viewer `3/3`; both exited `0`. No new finding was
  introduced.
- C11-R007 is closed and review status returns to `approved`. C11 and the extension remain `active` only for the
  project-owner Sandcastle retest and the subsequent Architecture commit checkpoint.

## C11-R008 project-owner manual finding

- Severity: `medium`; Status: `fixed`; Owner role: `execution`; manual-gate blocking.
- Finding: the Sandcastle direct blue `SceneGISPlanarPrimitive` polygon and magenta
  `SceneGISPlanarGroundPrimitive` line used string ids. Their GPU picks succeeded, but Cesium Viewer only promotes an
  `Entity` id (plus its existing 3D Tiles/imagery special cases) to `selectedEntity`, so neither direct object opened an
  InfoBox or received a SelectionIndicator. This was delivery metadata wiring, not a pick shader or command defect.
- Disposition: the example now creates two caller-owned metadata-only Entities in `viewer.entities`, with explicit
  names/descriptions and no renderable Graphics, and passes those Entity objects as the direct Primitive ids. The
  ordinary fallback position is the source polygon center at Z=130. The ground fallback position is a
  `CallbackProperty` at the polyline footprint center whose Z is resident-only `world.getTerrainHeight(center) ?? 0`;
  it does not request terrain or duplicate visible content. Direct objects remain directly owned by
  `scene.primitives`; Viewer and the public arbitrary-id contract are unchanged.
- Evidence: the existing single content E2E now uses separate direct ordinary/ground footprints, performs real GPU
  picks for both, clicks their window positions, and verifies the picked ids are the corresponding Entities,
  `viewer.selectedEntity`, exact InfoBox titles and finite SelectionIndicator anchors. Existing eight automatic role
  picks remain. Reusing the running local server through a repository-external config, dev and release each pass
  `1/1`; no public network request is allowed. Sandcastle text now explicitly invites inspection of both automatic
  Graphics and direct Primitive metadata.

## C11-R008 Architecture focused re-review

- Architecture confirmed that both Sandcastle direct objects remain directly owned by `scene.primitives`, while their
  caller-owned metadata-only Entity ids provide the standard Viewer selection and InfoBox seam. Product runtime delta
  remains `0`.
- Architecture used the updated real Sandcastle to click the blue direct Polygon and magenta direct Ground Polyline.
  Both displayed the exact expected InfoBox title and a finite visible SelectionIndicator anchored on the object.
- The focused dev/release E2E and Sandcastle build evidence are accepted; no new finding was introduced.
- C11-R008 is closed and review status returns to `approved`.

## Project-owner manual acceptance completion

- The project owner completed the remaining real browser/GPU inspection and explicitly accepted C11 after the R008
  correction. Ground-line view stability, ground SelectionIndicator placement, direct Primitive InfoBox metadata and
  the remaining unified content page were accepted.
- A final observation about the distant Label background was classified as Cesium's existing screen-space Label
  behavior: text and background retain their configured pixel size unless the application supplies distance-based
  properties. No C11-R009 finding or product/example change is required.
- Review remains `approved`; C11 and the `planar-content` extension are complete. Upstream-owned files=`0`, C11 SGP=`0`;
  the Architecture Agent creates the independent Chinese local commit checkpoint without pushing.
