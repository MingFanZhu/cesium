# Phase Plan: A1 Render Foundation and Dual-world Frame Contract

## Metadata

- Plan type: `phase`
- Status: `active`
- Parent plan:
  [atmosphere-clouds-effects extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Phase: `A1`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Predecessor checkpoint: planar closeout=`d822303e69`
- ADR:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md)
- SGP: proposed `SGP-0008`
- Related review: implementation时新建
  `../reviews/2026-08-14-a1-render-foundation.md`

## Objective

建立后续 physical atmosphere、aerial perspective、cloud/fog/god rays/lens flare共同依赖的最小渲染基础：

1. `Scene.renderEnvironment`末端、既有primary-world hook之前的 SceneGIS advanced-background slot；
2. `Scene.resolveFramebuffers`取得resolved scene color/depth之后、`PostProcessStageCollection.execute`之前的 linear-HDR slot；
3. SceneGIS-owned private pipeline的single-Scene attachment、inactive identity、detach/destroy与candidate publication contract；
4. 显式 Globe/planar reference-frame publication，锁定各自几何输入，禁止坐标语义串用。

A1结束时仍不产生新可见效果。它以 real Context order/pixel identity/resource lifecycle证据证明 integration seam正确，为 A2冻结 public
Controller与 Bruneton asset contract提供可信基础。

## Non-goals

- 不实现 Bruneton LUT、physical sky、Sun disk、aerial perspective、height fog、cloud、shadow、god rays、bloom、lens flare或TAA。
- 不增加 public export、Widget/Viewer option、Controller、preset或质量参数；A2才能冻结外部API。
- 不修改 `PostProcessStageCollection.js`、`SkyAtmosphere.js`、`Fog.js`、`SunPostProcess.js`、Renderer public classes或build/package manifest。
- 不创建 texture、Texture3D、Framebuffer、ComputeCommand、Worker、asset、network request、listener、timer或animation loop。
- 不改变既有 `SceneGISPlanarEnvironment`、simple planar atmosphere、native Globe sky/fog或 SGP-0003行为。
- 不修改 Test/Sandcastle、formal Guide/Architecture正文或generated files；A1只交付ADR、private foundation、Specs与AgentDocs。

## Entry conditions

- Branch=`feature/atmosphere-clouds-effects`。
- Formal implementation base必须是Architecture assignment给出的exact planning checkpoint；Execution不得自行选择其他base或roadmap item。
- Working tree必须干净；发现owner/unrelated dirty file立即停下回报，不得格式化、暂存或覆盖。
- ADR-0040=`approved`，`SGP-0008`=`proposed`，upstream baseline为 Cesium `1.144` commit
  `6d5d8b1f0725b6f831b336463f4b11c98023427b`。

## Current source facts

- `Scene.renderEnvironment`先绘制native SkyBox/SkyAtmosphere/Sun/Moon/panorama，再通过 paired `SGP-0003`调用optional
  `world.renderEnvironment(frameState, passState)`；ordinary geometry随后执行。
- `Scene.resolveFramebuffers`在 OIT 与 translucent classification resolve后，从globe/scene framebuffer取得resolved color texture、
  depth-stencil texture与id texture，然后调用`postProcess.execute`及copy。
- `PostProcessStageCollection.execute`当前顺序为 ambient occlusion、built-in bloom、auto exposure、tone mapping、custom stages、FXAA；
  ordinary custom stage不是 pre-tonemap HDR seam。
- `scene._hdr`会使`usePostProcess`成立并建立 scene framebuffer。A1不能新增第二套Scene framebuffer或在无postprocess路径偷偷复制。
- `Texture3D`、`Texture`、`FramebufferManager`、`ComputeCommand`已存在于 Cesium Renderer；后续阶段不得因参考原型使用 raw `_gl`而绕开它们。
- ADR-0039在live non-Globe Scene禁止native Fog/Sky/body；ADR-0036 simple planar atmosphere继续通过 SGP-0003执行。
- Codebase graph当前未收录部分近期 SceneGIS environment private files；相关发现使用 exact file/string fallback，并将该 index gap视为工具限制，
  不能据此推断文件不存在。

## Detailed contract

### Scene integration

- 在 `Scene.js`增加唯一purpose的paired `SGP-0008` marker ranges；不得嵌套或扩写`SGP-0003`。
- Background slot在所有native environment work之后、`world.renderEnvironment`之前调用attached private pipeline。它只在normal render
  environment execution中出现，保持current `passState.framebuffer`，A1返回identity且不发布command。
- HDR slot在`resolveFramebuffers`准备好resolved color/depth/id texture后、调用`postProcess.execute`前执行。A1必须把input color texture
  原样返回；Scene以返回值作为postprocess color input。
- Pipeline absent/inactive时不得增加framebuffer、clear、copy、command、allocation或输出变化。Invalid/destroyed pipeline与invalid returned
  texture在修改original framebuffer前fail-fast。
- Existing OIT、globe-depth、MSAA、HDR、AO/bloom/tone/custom/FXAA与copy顺序不得变化；pick/offscreen路径不得误执行advanced slots。

### Private pipeline lifecycle

- 新增唯一 SceneGIS-owned private module，提供显式attach/detach与`renderBackground`/`executeHdr`入口；不得让任意consumer直接写散落的
  Scene fields或使用prototype/global registry。
- 每个live Scene最多一个attached pipeline。重复attach、cross-Scene attach、destroyed attach、foreign replacement都要在Scene/framebuffer
  mutation前失败。
- detach只在Scene仍持有同一pipeline时清除authority；foreign override不被销毁或覆盖。`destroy()` exactly once并在未来资源owner扩展前锁定
  idempotence/DeveloperError风格与Scene destroy边界。
- A1没有GPU resource。测试必须证明attach/inactive/detach/destroy前后 Scene、FramebufferManager、postprocess texture和command identities稳定。

### Reference-frame publication

- Mode必须显式为`globe`或`planar`；不得从CRS、坐标值、ellipsoid identity或DOM推断。
- Globe adapter只读取live Globe Scene、Scene ellipsoid、camera world pose与ellipsoid surface normal/radial altitude所需状态；不得把
  planar World作为Globe，也不得改变native Scene slots。
- Planar adapter必须接收同一live `SceneGISPlanarWorld`，轴固定`+X East/+Y North/+Z Up`，高度为world Z相对显式base；不得读取
  `Camera.positionCartographic`、native Fog或ellipsoid radii。Sun authority在A2接入，A1不猜测新的方向协议。
- Publication使用caller-provided result/scratch、finite validation与candidate-then-publish；失败保持上一次stable snapshot不变，不request render。
- A1只冻结后续 shader必需的geometry/camera basis与meters contract，不提前冻结atmosphere/cloud参数或asset dimensions。

## Allowed paths

### Product and upstream seam

- `.scenegis/upstream-patches.json`（只把既有proposed `SGP-0008`在A1通过review后转`active`并同步exact tests；不得新增SGP）
- `packages/engine/Source/Scene/Scene.js`（upstream-owned；仅paired `SGP-0008`）
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsPipeline.js`（new）
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISAtmosphereReferenceFrame.js`（new；若源码事实要求拆成两个adapter，先回写偏差）

### Focused Specs

- `packages/engine/Specs/SceneGIS/Scene/SceneGISAdvancedEnvironmentRenderSlotSpec.js`（new）
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipelineSpec.js`（new）
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISAtmosphereReferenceFrameSpec.js`（new）
- `packages/engine/Specs/SceneGIS/Scene/SceneGISWorldSpec.js`（仅SGP-0003 order regression确有必要时）

### Architecture records

- `Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md`
- `AgentDocs/atmosphere-clouds-effects/**`

## Forbidden paths and escalation

- 禁止修改除`Scene.js`之外的upstream-owned file；不得修改`PostProcessStageCollection.js`、`View.js`、`GlobeDepth.js`或Renderer。
- 禁止修改public indexes/JSDoc API、Widget/Viewer、World/Environment、Shader、Worker、Test、Sandcastle、package/build scripts。
- 禁止访问`context._gl`、复制reference repo、增加third-party dependency或写入runtime URL。
- 若identity HDR slot无法只在`Scene.js`取得resolved color/depth并保持OIT/MSAA/tone顺序，立即停止并提交源码事实；不得自行增加第二SGP/
  upstream file或把slot移到tone mapping之后。
- 若Globe/planar reference-frame需要冻结新的public semantics或更改ADR-0033/0034/0039，停止请求Architecture decision。

## Implementation sequence

1. 重新以当前源码核对`renderEnvironment`、`resolveFramebuffers`、`PostProcessStageCollection.execute`和pick/offscreen callers；把line drift与
   necessary plan deviation回写本plan。
2. 先写slot order/identity/failure Specs与private pipeline attachment/lifecycle unit Specs。
3. 实现private pipeline与显式dual-world reference-frame publication，保持A1零GPU resource。
4. 在`Scene.js`加入两段paired `SGP-0008` narrow delegation，确保background在SGP-0003前、HDR在postprocess前。
5. 运行real Context representative combinations与upstream Scene focused regression，证明pixels、depth、postprocess与resource identity。
6. 更新SGP status/test list、A1 execution results和review request后停止；不commit、不push、不请求manual gate、不进入A2。

## Validation

### Required behavior

- Pipeline absent、attached inactive、detached三种路径输出与baseline像素一致，advanced call count符合normal render而pick/offscreen为0。
- Background order明确为native environment → advanced slot → existing primary-world slot → ordinary geometry。
- HDR order明确为resolved OIT/translucency/color/depth → advanced slot → AO/bloom/auto exposure/tone/custom/FXAA → original framebuffer copy。
- Globe depth/scene depth、with/without OIT、MSAA representative与HDR on路径均返回同一input texture；resize后仍无额外resource。
- duplicate/cross-Scene/destroyed attachment与invalid return failure atomic；detach/destroy不清除foreign authority。
- Globe/planar frame snapshots覆盖Perspective与Orthographic representative、camera move、高空/地面、finite validation、result identity和last-good
  publication；planar从不读取Cartographic/ellipsoid altitude。

### Required commands and audits

- Focused new SceneGIS Specs及最小upstream `Scene/Scene` aggregate。
- `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run tsc`；A1无public docs变化，不要求`build-docs`。
- Changed-scope ESLint/Prettier/Markdownlint与`git diff --check`。
- `node scripts/scenegis/audit-upstream-patches.mjs`；expected upstream-owned=`1`（仅`Scene.js`/SGP-0008），generated status=`0`。
- Exact status审计确认没有shader JS、index、declaration、Build或reference asset进入diff。

## Acceptance criteria

- 两个render slots在真实Cesium pipeline中具有确定顺序、normal-pass边界与identity pixels证据。
- A1 disabled/identity path不分配GPU resource、不改变command/postprocess/framebuffer identity，也不引入常驻更新。
- Globe/planar reference-frame contract明确隔离并有last-good/failure evidence，足以让A2不再猜测坐标入口。
- Upstream-owned file恰好`Scene.js`，paired `SGP-0008`完整、audit通过；无其他SGP、public API或generated diff。
- Review-ready handoff列出实现、验证、exact paths、SGP/ADR、偏差和未解决风险，working tree未commit、未push。

## Manual gate

A1无可见产品效果，不设置项目负责人视觉manual gate。Architecture只审查代码、order/pixel/resource证据与upstream audit；批准后建立独立
本地checkpoint。A2开始后才增加physical atmosphere visual gate。

## Stop conditions

- 需要第二个upstream-owned file、raw GL、额外framebuffer或修改postprocess order才能完成identity seam。
- Pick/offscreen无法在slot前可靠区分，或slot会在original framebuffer copy后执行。
- Planar adapter必须消费Cartographic/ECEF/ellipsoid radius，或Globe adapter必须依赖SceneGISPlanarEnvironment。
- Attach/detach无法在Scene destroy与caller ownership之间保持exactly-once/failure-atomic contract。
- Architecture review完成前不得commit/push或进入A2。

## Execution results

待 Execution Agent 实现后回写。当前状态：未实现、未commit、未push、不得进入下一phase。
