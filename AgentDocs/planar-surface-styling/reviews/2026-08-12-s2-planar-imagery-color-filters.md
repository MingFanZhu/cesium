# Review: S2 Planar Imagery Color Filters

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Review target: working tree on `feature/planar-surface-styling` at base
  `50f3719c1a54ff4514d39432e4f6c10879ae8926`
- Related plan:
  [S2 phase plan](../plans/2026-08-12-phase-s2-planar-imagery-color-filters.md)
- ADR: `Documentation/SceneGIS/Decisions/ADR-0031-planar-imagery-color-filters.md`
- SGP: None

## Scope

复核七个public filter properties、normal-render slot snapshot、完整uniform shape与处理顺序、real-Context pixels、
mutation/resource identity、public build/types/docs/package、既有Sandcastle controls及zero-upstream/generated边界。

## Summary

Architecture已完成首轮复核、focused re-review与R004浏览器复核。七个public properties、filter顺序、normal-render
snapshot、默认/非默认像素、shader/resource identity与交付构建成立；S2-R001至S2-R004均已修复并闭环。代码review结论为
`approved`，项目负责人manual gate已通过；S2满足本地checkpoint条件，未push、未进入S3。

## Findings

<!-- markdownlint-disable MD060 -->

| ID      | Severity | Status | Owner role | Location                                                                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Required disposition / evidence                                                                                                                                                                                                                                                                                                                                       |
| ------- | -------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-R001 | high     | fixed  | execution  | `SceneGISPlanarImageryLayerCollection.js:116`、`_SceneGISPlanarSurface.js:44-47`、`_SceneGISPlanarImagery.js:403-419` | Collection丢弃layer setter提供的property name；Surface随后把“任意changed且当前hidden”都当成show-hide transition。Layer已经hidden并settle后修改任一filter，会再次清空normal-render command replay并调用`releaseLayer`；即使runtime已经不存在，`releaseLayer`仍无条件把imagery readiness设为false，而Surface/public readiness缓存可能仍为true。该行为违反S2“filter mutation不release、不改变readiness/depth replay”，并造成内部与公开readiness暂时不一致。 | Collection现转发property；Surface仅在`removed`或`property === "show" && !layer.show`时release。新增property-forwarding与settled-hidden real-Context回归；七项filter mutation后internal/surface/public readiness、counters/runtime、normal/depth replay均稳定，下一normal render不请求hidden layer。Architecture独立复跑Layer/Collection `12/12`与Widget `12/12`通过。 |
| S2-R002 | medium   | fixed  | execution  | `SceneGISPlanarImageryCesiumWidgetSpec.js:397-433`、S2 phase plan lines 222-227                                       | 当前所谓maximum-layer证据只把128层送入`shownLayers > maximumTextureImageUnits`的早期`DeveloperError`，不会生成、链接或执行带完整filter uniforms的最大合法variant；其余real-Context只有1-2层。每层现有10个fragment uniform声明，而Cesium明确同时暴露texture-unit与fragment-uniform-vector limits，因此现有证据不能支持phase plan“当前real Context已证明完整uniform shape硬件上限”的结论。                                                                 | 当前Context实际limits为texture units `16`、fragment uniform vectors `1024`。新增real-Context用例使16-layer完整variant经产品Surface生成、链接、渲染；第17层由产品路径在request、tile selection、command或shader mutation前fail-fast。Architecture独立复跑Widget `12/12`通过。                                                                                          |
| S2-R003 | low      | fixed  | execution  | `SceneGISPlanarImageryLayer.js` validator/JSDoc及Layer Spec                                                           | `colorToAlphaThreshold`复用`validateAlpha`，constructor/setter非法值都抛出“alpha must ...”，使新增public property的diagnostic指错字段；brightness/contrast/saturation/gamma的`@exception`又写成“not finite and non-negative/positive”，字面上与实际accepted contract相反。                                                                                                                                                                               | 新增property-aware unit-range validator，threshold constructor/setter准确命名字段；Spec精确断言message。四处JSDoc改为“not a finite ... number”，accepted values、failure atomicity与既有alpha message不变。Architecture独立复跑Layer/Collection `12/12`通过。                                                                                                         |
| S2-R004 | medium   | fixed  | execution  | `packages/sandcastle/gallery/scenegis-planar-imagery/index.html`                                                      | Manual gate发现filter controls与status虽存在于DOM，但保持`position: static`且被full-size Cesium canvas覆盖，控件不可见、不可操作。                                                                                                                                                                                                                                                                                                                       | Demo overlay改为显式absolute positioning、`z-index:2`、独立背景/边框和compact overflow；代表/紧凑Chromium hit-test命中overlay，status不覆盖credit，brightness改变canvas pixels。Architecture独立复核成立，项目负责人manual gate通过。                                                                                                                                 |

<!-- markdownlint-enable MD060 -->

### Scope amendment for S2-R001

首轮源码复核推翻了phase plan line 58-59“filter setter无需property-aware collection”的source-fact判断。Architecture批准仅为
S2-R001增加以下SceneGIS-owned路径：

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarImageryLayerCollection.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarImageryLayerCollectionSpec.js`

Upstream-owned files仍为`0`，SGP仍为None；不批准修改`_SceneGISPlanarImagery.js`来掩盖重复release，也不改变show/remove的既有
release语义。

## Validation reviewed

- ImageryLayer `11/11`；Surface aggregate `37/37`；Imagery Widget `11/11`；A7 lit terrain qualification `1/1`。
- Dev/release/types/docs/tsc全部exit 0；installed tarball verifier通过；generated declarations/API含七个属性。
- Sandcastle gallery no-embedding处理307 examples。
- Scoped static checks、upstream/generated audit通过；upstream-owned files=`0`、SGP=None。
- 项目负责人于`2026-08-12`在现有`scenegis-planar-imagery`完成manual gate并确认验收通过。
- Architecture独立复跑ImageryLayer `11/11`、Surface aggregate `37/37`、Imagery Widget real-Context `11/11`，并复跑
  scoped ESLint/Prettier/Markdownlint、upstream/generated audit与`git diff --check`；均通过，但这些检查未覆盖上述
  hidden-layer property-routing与maximum-legal-layer链接边界。
- Architecture focused re-review独立复跑Layer/Collection `12/12`、Widget real-Context `12/12`与Surface aggregate
  `37/37`，全部`TOTAL SUCCESS`；Widget覆盖16-layer实际link/render、17-layer无副作用fail-fast与hidden filter
  readiness/replay稳定。
- Architecture再次运行upstream audit与`git diff --check`：current delivery upstream-owned entries=`0`、generated
  status=`0`、SGP=None；仅有Windows LF→CRLF提示。临时limits诊断代码未留在最终Spec。
- Architecture独立复核R004的代表与紧凑viewport：controls/status hit-test命中overlay而非canvas，compact controls
  可滚动、status与credit不重叠，brightness `1 -> 0.2`改变实际canvas pixels。浏览器唯一404为`--no-embeddings`
  按预期未生成的外层`gallery/embeddings.json`，不影响Viewer或filter gate。

## Accepted risks

当前Context已实际链接并渲染最大16层variant；未来Cesium baseline、GPU uniform limit、builtin precision与color-space差异
仍属于升级风险，并已记录于ADR-0031与upgrade checklist。S2不承诺跨硬件固定layer上限，也不宣称与Globe HDR pipeline完全等价。

## Conclusion

`approved`。S2-R001至S2-R004均已fixed，无unresolved finding；代码、自动化与项目负责人manual gate全部通过。
S2满足独立本地checkpoint条件；checkpoint后仍不得push或自动进入S3。

## Execution response to findings

- `S2-R001`：已修复待复核。Collection转发layer setter的property；Surface只在`removed`或`show`实际变为false时release。
  新增property-forwarding Spec与settled hidden layer real-Context回归，覆盖七项filter、internal/surface/public readiness、
  request/texture/binding/runtime counters、最近normal replay/depth replay及下一normal render不请求hidden layer。
- `S2-R002`：已补证待复核。当前real Context limits为texture image units `16`、fragment uniform vectors `1024`；
  16-layer完整uniform Shader成功link/render，第17层由产品Surface在request/selection/shader mutation前fail-fast。
- `S2-R003`：已修复待复核。threshold使用property-aware range diagnostic并有精确message assertion；四处filter JSDoc逻辑措辞修正，
  alpha message与accepted values不变。
- 最终focused results：Layer/Collection `12/12`、Surface aggregate `37/37`、Widget real-Context `12/12`。
- 状态：Execution未commit、未push、未进入S3；Architecture已关闭findings并接管phase checkpoint。

## S2-R004 manual-gate blocker response

- Status：fixed并由Architecture复核关闭。Architecture在真实Sandcastle发现controls/status为static且被canvas覆盖，因此曾撤回approval。
- Scope：只修改`packages/sandcastle/gallery/scenegis-planar-imagery/index.html`的overlay CSS；未修改engine、renderer、public API
  或demo JavaScript。
- Fix：controls/status显式absolute positioning、`z-index:2`、可读背景与边框；status位于credit上方；controls在小iframe使用
  max-height/overflow，紧凑路径`max-height <= 220px`并可实际滚动。
- Chromium representative evidence：controls/status hit-testing分别解析为overlay内`LABEL`和`#status DIV`，均非canvas；computed
  position=`absolute`、z-index=`2`，status与credit无重叠。
- Chromium compact evidence：controls rect height=`220`、clientHeight=`218`、scrollHeight=`247`、overflow=`auto`；status hit-test
  仍命中overlay且不覆盖credit。brightness slider可交互，value `1 -> 0.2`，纯地图区域截图hash发生变化；console error count=`0`。
- 两种viewport截图均已由Execution检查；Architecture又独立复核代表/紧凑viewport、overlay hit-test、compact overflow、
  credit避让与brightness pixel mutation。项目负责人随后确认manual gate通过，focused browser proof未被用于替代人工确认。
