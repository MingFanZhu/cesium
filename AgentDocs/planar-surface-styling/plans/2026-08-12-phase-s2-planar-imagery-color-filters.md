# Phase Plan: S2 Planar Imagery Color Filters

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-surface-styling extension](2026-08-12-planar-surface-styling-extension.md)
- Phase: `S2`
- Owner role: `execution`
- Architecture review: `approved`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Related discussions: 项目负责人提出平面 `ImageryLayer` 对齐球面常用颜色滤镜
- Related reviews:
  [S2 planar imagery color filters](../reviews/2026-08-12-s2-planar-imagery-color-filters.md)
- ADR: 新建 `Documentation/SceneGIS/Decisions/ADR-0031-planar-imagery-color-filters.md`
- SGP: None expected; upstream-owned diff 出现前必须停止并升级计划

## Objective

在不改变 planar imagery 请求、缓存、纹理、LOD、single-command 合成和 depth/pick replay 的前提下，为
`SceneGISPlanarImageryLayer` 增加 `brightness`、`contrast`、`hue`、`saturation`、`gamma`、
`colorToAlpha` 与 `colorToAlphaThreshold` 公共属性。所有变化必须在下一次 normal render 以
per-tile slot/uniform 快照发布；默认值严格保持当前像素，非默认值不得改变 shader variant identity 或重建
GPU/imagery 资源。

## Non-goals

- 不实现 `dayAlpha`、`nightAlpha`、`splitDirection`、`cutoutRectangle`、texture sampler filter、
  reprojection 或 provider-side image processing。
- 不修改 Globe `ImageryLayer`、Globe shader 或其 Earth-specific runtime，不声明 planar 与 Globe 的颜色空间
  完全等价。
- 不增加 multipass、CPU canvas、per-tile framebuffer、额外 imagery request/texture 或 shader feature-key
  组合。
- 不改变 layer `show`/`alpha`、collection ownership/order、provider ownership、texture-unit fail-fast、
  `tilesLoaded`、terrain lighting/normal、World/Viewer/controller 或 Ground 行为。
- 不在本阶段提前实现 terrain height/slope/aspect/contour styling。

## Entry conditions

- Branch=`feature/planar-surface-styling`，base/HEAD=
  `04ac138b37295f328f3542f143b2f6b738a7e021`，working tree clean。
- S1 Architecture review approved，checkpoint 已作为独立本地提交存在；S1 Shader source/delivery foundation
  可供本阶段直接扩展。
- Architecture 已复核当前 layer mutation、Surface slot/uniform、shader cache、normal/depth replay、Globe filter
  math、real-Context Specs 与现有 `scenegis-planar-imagery` 示例。

## Current source facts

- `SceneGISPlanarImageryLayer` 当前只拥有 `show` 与 `alpha`，setter 通过 private listener 通知 collection；
  provider 始终 caller-owned。
- Surface 只在 normal render 的 `updateTileSlots` 把每层 `texture`、`translationScale` 与 `alpha` 复制到
  `tile._imagerySlots`；uniform map 闭包读取 slot。depth/pick-only pass 只重提最近 normal render 的 command
  references，不运行 selection、slot mutation 或资源状态机。
- shader cache key 固定为 `layerCount/lighting/normalMode`。现有动态 builder 为每个 shown layer 静态展开
  sampler、UV、alpha 与 bottom-to-top composition；S1 fragment template 在完成合成后统一执行既有 lighting。
- collection 的 layer change 回调不保留 property name；Surface 仅在 layer 隐藏时 release runtime。滤镜 setter
  因而无需修改 collection 或触发 release，下一 normal render 读取 layer 并更新 slot 即可。
- Globe `sampleAndBlend` 先比较 raw sampled RGB 执行 color-to-alpha，再按 gamma、brightness、contrast、hue、
  saturation 顺序处理颜色，最后应用 layer alpha。Globe 在默认 gamma 分支额外调用 `czm_gammaCorrect`，而当前
  planar shader 直接合成 sampled RGB；直接复制该默认分支会改变 planar 默认像素，尤其是 HDR 配置。
- Cesium uniform setter 接受 persistent `Color`/`Cartesian4` 作为 `vec4`。Surface 可以在 slot 创建时建立
  `Cartesian4` 并在后续 normal frame 原地更新，避免 warm-frame 临时对象。
- 现有 Widget Spec 使用本地 canvas fixture，可读取确定像素并记录 request、texture、binding、shader、command
  identity；现有 Surface Spec 已覆盖 normal-render snapshot 与 depth replay。

## Public contract

`SceneGISPlanarImageryLayer` 构造 options 与同名 mutable properties 增加：

| Property                | Default     | Accepted value                                     | Meaning                                  |
| ----------------------- | ----------- | -------------------------------------------------- | ---------------------------------------- |
| `brightness`            | `1.0`       | finite non-negative number                         | `mix(vec3(0.0), color, brightness)`      |
| `contrast`              | `1.0`       | finite non-negative number                         | `mix(vec3(0.5), color, contrast)`        |
| `hue`                   | `0.0`       | any finite number, in radians                      | Cesium `czm_hue(color, hue)`             |
| `saturation`            | `1.0`       | finite non-negative number                         | Cesium `czm_saturation(color, value)`    |
| `gamma`                 | `1.0`       | finite positive number                             | `pow(color, vec3(1.0 / gamma))`          |
| `colorToAlpha`          | `undefined` | `Color` with finite normalized RGB, or `undefined` | raw sampled RGB target; alpha is ignored |
| `colorToAlphaThreshold` | `0.004`     | finite number in the inclusive range `[0.0, 1.0]`  | strict max-channel RGB distance          |

- `colorToAlpha` is defensively cloned on construction, get and set, so caller mutation cannot bypass validation or
  notification. Its public alpha component has no sampling meaning; only finite normalized RGB is validated and used.
- Assigning the current scalar value or an RGB-equal `colorToAlpha` is a no-op. A changed value notifies the attached
  collection but never transfers provider ownership or releases imagery.
- Invalid constructor values or setters throw `DeveloperError` before changing any layer state or notifying the
  collection. Existing `show`/`alpha` validation and lifecycle remain unchanged.
- `colorToAlpha === undefined` disables the operation. With a target present, a sample becomes transparent only when
  `max(abs(sample.rgb - target.rgb)) < colorToAlphaThreshold`; threshold `0.0` therefore matches nothing, consistent
  with the strict comparison.

## Shader and state design

1. Every shown layer variant always declares the complete approved filter uniform set. Default/non-default toggles do
   not add defines, alter dynamic source shape, extend the cache key or compile a new shader. The only existing source
   variants remain layer count, lighting and normal mode. Uniform-controlled branches must skip each scalar operation
   at its exact identity default (`gamma/brightness/contrast/saturation == 1.0`, `hue == 0.0`) instead of relying on
   `pow`/builtin arithmetic to reproduce the input bit-for-bit; this is the stable default fast path.
2. Per-layer fragment order is fixed as follows:
   - sample texture with the existing clamped UV transform;
   - compare raw sampled RGB with the optional color-to-alpha target and set sample alpha to zero on match;
   - apply gamma, brightness, contrast, hue and saturation in that order to sample RGB;
   - compute `effectiveAlpha = sample.a * layer.alpha` and bottom-to-top mix into the opaque accumulated RGB;
   - after all layers, run the existing terrain lighting exactly once and output alpha `1.0`.
3. The planar default path intentionally does **not** add Globe's unconditional `czm_gammaCorrect` branch. Identity
   uniforms bypass their corresponding operations in the current planar sampled color space, preserving existing
   default pixels. `czm_hue` and `czm_saturation` may be reused as coordinate-independent builtins; no new `czm_*`
   builtin is added.
4. Surface copies every filter value into the existing tile slot during normal render. Scalar slots hold numbers;
   color-to-alpha uses a persistent slot value suitable for a `vec4` uniform, with an internal enabled/sentinel encoding
   chosen by Execution. Because the public getter defensively clones, this SceneGIS-owned internal path may read the
   layer's private stored color directly when copying components; it must not allocate a public getter clone per tile.
   The encoding must preserve public threshold semantics, avoid per-frame allocation, and never expose the sentinel as
   API.
5. Uniform closures read only `tile._imagerySlots`, never live layer properties. Thus mutation after the last normal
   render cannot leak into a depth/pick replay; the next normal render atomically publishes the new slot snapshot while
   reusing the existing `DrawCommand`, `ShaderProgram`, texture, binding, mesh and vertex array.
6. Filter changes do not invalidate readiness, request tiles, upload/duplicate textures, release cache entries or change
   layer count. Warm normal frames with unchanged values remain allocation-stable within current persistent counters.

## Affected paths

### Allowed

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarImageryLayer.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`
- `packages/engine/Source/Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarImageryLayerSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceShaderSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarImageryCesiumWidgetSpec.js`
- `packages/sandcastle/gallery/scenegis-planar-imagery/index.html`
- `packages/sandcastle/gallery/scenegis-planar-imagery/main.js`
- `packages/sandcastle/gallery/scenegis-planar-imagery/sandcastle.yaml`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md`（只增加 ADR-0031
  amendment/link，不改写 P5 历史决定）
- `Documentation/SceneGIS/Decisions/ADR-0031-planar-imagery-color-filters.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-surface-styling/**`

### Forbidden without Architecture re-approval

- `SceneGISPlanarImageryLayerCollection.js`、所有 imagery provider/private request/cache/texture runtime
- shader cache key、World、terrain、Worker、Ground、Primitive、Viewer/widgets integration、controller 或 Scene loop
- `packages/engine/Source/Shaders/SceneGIS/**` 中本 phase 明确列出的 fragment template 以外文件
- `scripts/**`、package/build/index generator、package manifests、`.gitignore`、`.scenegis/**`
- Cesium upstream-owned `ImageryLayer`/Globe/Renderer/Shader files或其他 upstream-owned path
- 新 Sandcastle 目录、E2E/Playwright、网络 fixture 或下载/预取逻辑
- 任何 generated index、declaration、Shader JS、SpecList、API docs 或 `Build/**`

## Steps

1. Execution 复核 branch/HEAD/status、S1 checkpoint 与本 plan；任何 base/path 差异先通知 Architecture。
2. 扩展 `SceneGISPlanarImageryLayer` constructor/JSDoc/getters/setters/validation，完成 scalar failure atomicity 与
   `colorToAlpha` defensive clone/no-op 语义。
3. 扩展 Surface slot 与 uniform map；确保只在 normal render 复制状态，depth replay 读取最后发布快照，且不修改
   imagery runtime 或 shader cache key。
4. 扩展 S1 dynamic fragment composition，按本 plan 固定顺序实现稳定完整 uniform shape 与默认 identity。
5. 补 public contract、shader source/order、slot snapshot/replay、real-Context deterministic pixels、warm identity 和
   lifecycle Specs。不得用只检查字符串替代实际 WebGL pixel proof。
6. 扩展现有 `scenegis-planar-imagery`，显式创建 layer，并提供所有滤镜与 reset 的可操作控件；保持 OSM
   best-effort/usage policy、explicit engine-level assembly 与 caller ownership。
7. 新建 ADR-0031；更新 ADR-0005 amendment、Architecture、使用指南与升级 checklist，明确颜色空间、顺序、
   snapshot、cache/resource 和未来升级复核点。
8. 运行最小充分 API/Shader/real-Context/build/types/docs/package/Sandcastle/static/ownership 检查，回写实际命令、
   case count、偏差与结果；新建 S2 review request 并通知 Architecture ready-for-review。

## Automated validation

- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarImageryLayer"`
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`
- `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget"`
- 至少复跑一个既有 real-Context lit terrain qualification，证明 filter 仍在 imagery composition 后、lighting 前且
  normal/lighting variant 不退化；Execution 写回精确 includeName 与 case count。
- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- `node scripts/scenegis/verify-planar-packages.mjs`
- 在 `packages/sandcastle` 运行 `npm run build-gallery-no-embedding`，证明修改后的既有 demo metadata/source 可发现；
  不访问 OSM 作为自动化 gate。
- changed-scope ESLint、Prettier、Markdownlint；AgentDocs 另运行
  `npx prettier --check --ignore-path .gitignore "AgentDocs/planar-surface-styling/**/*.md"` 与
  `npx markdownlint "AgentDocs/planar-surface-styling/**/*.md"`。全 `AgentDocs/**` baseline 当前已有与 S2
  无关的历史 Prettier finding，不得顺手修改。
- `git diff --check`
- `node scripts/scenegis/audit-upstream-patches.mjs`
- `git status --short` 与 generated-file audit：生成的 index/declaration/docs/Shader JS/Build/SpecList 不得进入 diff。

Real-Context evidence 至少覆盖：

- default layer 对现有 local image fixture 产生与 S1/P5 相同像素；
- 五个 scalar filter 均有 deterministic non-default pixel evidence，hue/saturation 使用 Cesium builtin 的容差
  assertion；gamma 使用 `1.0/gamma` 语义；
- color-to-alpha 在 raw sampled RGB 命中时暴露 base/lower layer，未命中和 threshold `0.0` 保留 sample；
- multi-layer 中 filter 只影响所属 layer，alpha 与 bottom-to-top 顺序不变；
- setter 后、下一 normal render 前 slot/uniform snapshot 仍为旧值；depth/pick replay 不发布新值；下一 normal
  render 才发布新值；
- filter mutation 前后 request count、Texture、binding、mesh/VA、DrawCommand、ShaderProgram 与 shader-map size
  不变，destroy balance 仍 exactly once。

## Manual gate

Architecture review approved 后，由项目负责人在现有 `scenegis-planar-imagery` Sandcastle 完成一次人工 gate：

- 初始/default 与 reset 画面无可见差异；
- brightness、contrast、hue、saturation、gamma 各控件可见生效且连续更新无闪烁/重新加载；
- color-to-alpha enable/target/threshold 可见生效，disable/reset 恢复；
- 相机交互、ready-ancestor、OSM credit 和 best-effort fallback 保持可用。

外部 OSM 不可用只影响该人工服务画面，不得替代或阻塞本地 deterministic Specs；可以在服务恢复后重试
manual gate。项目负责人确认前 phase 不得 checkpoint 或进入 S3。

## Risks and dependencies

- `pow`、hue 与 saturation 对颜色空间/precision 敏感；默认 identity 和 deterministic tolerances 必须分别证明，
  不能宣称与 Globe HDR pipeline 完全相同。
- 所有 shown layer 总是携带完整 filter uniform set，会增加 uniform 数量但不增加 texture units。S2 接受这项有界
  成本以换取 mutation 无 recompile；real-Context 与 maximum-layer fail-fast 路径必须证明可链接。
- `Color` 是 mutable object；缺少 defensive clone 会绕过 listener/snapshot。Specs 必须覆盖 constructor input、getter
  result 与 setter input 的外部 mutation。
- 若当前 Cesium builtin dependency scan、GLSL linker 或硬件 uniform limit 因完整 uniform shape 失败，Execution
  必须停止并回报证据，不得自行改成 feature-dependent shader key 或 multipass。
- Sandcastle 依赖公网 OSM，仅用于人工 gate；自动化继续使用本地 canvas fixture并禁止公网请求。

## Completion criteria

- 七个批准的 filter properties 具有文档化、验证严格、failure-atomic 的公共契约，默认像素等价。
- Filter 顺序、raw color-to-alpha、planar gamma 空间、alpha/composition/lighting 顺序由 ADR-0031、shader source 与
  real-Context pixels 一致证明。
- 所有 mutation 只通过下一 normal-render slot/uniform snapshot 生效；depth replay 和 warm resource/command/shader
  identity 保持不变。
- 现有 Sandcastle 可操作展示并通过项目负责人 manual gate；API build/types/docs、dev/release/installed package 与
  ownership/generated-file checks 全部通过。
- Upstream-owned files=`0`、SGP=None，或任何偏差已停止并获 Architecture 重新批准。
- Architecture/code review approved、findings 关闭、manual gate 通过后，由 Architecture 创建中文本地 S2
  checkpoint；此前 Execution 未 commit、未 push、未进入 S3。

## Deviations and results

- Implementation status：`completed`；Architecture review approved、项目负责人manual gate通过；随本次状态回写创建
  S2本地checkpoint，未push、未进入S3。
- Public contract：新增七个批准属性、constructor/setter validation、scalar/RGB no-op notification、
  `colorToAlpha` constructor/get/set defensive clone与alpha ignored语义。invalid setter在state/listener mutation前失败。
- Runtime/shader：每层固定新增完整filter uniform set；slot内复用persistent `Cartesian4`，`w`为private enabled
  sentinel。normal render原地发布；depth/pick-only replay不读取live layer。shader key仍为
  `layerCount/lighting/normalMode`，filter mutation未触发request/texture/binding/VA/command/shader replacement。
- Shader顺序按plan实现raw color-to-alpha、gamma、brightness、contrast、hue、saturation、layer alpha/mix；
  identity defaults显式branch，未增加`czm_gammaCorrect`或新builtin，existing terrain lighting仍在全部layer之后一次执行。
- Real-Context：default pixel保持；五个scalar filter均有deterministic pixels；color-to-alpha覆盖raw命中、未命中、
  threshold 0与disable；双层alpha/order与filter所属层隔离通过；mutation identity与destroy既有证据通过。
- Sandcastle：扩展现有`scenegis-planar-imagery`，显式持有layer并提供五个scalar、color target/enable/threshold与reset控件；
  OSM credit、best-effort、usage policy、explicit CesiumWidget/controller assembly与caller-owned provider不变。
- 正式文档：新增ADR-0031；Architecture加入filter/snapshot/resource规则；ADR-0005仅加amendment；Guide加入API示例；
  upgrade checklist加入filter order/default/snapshot升级复核。
- Focused Specs：ImageryLayer include=`11/11`（Layer `7`、Collection既有`4`）；Surface aggregate=`37/37`
  （Shader `6`、Surface `31`）；Imagery Widget=`11/11`；A7 lit terrain qualification=`1/1`。
- Build/delivery：`npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`全部exit 0；build-ts保留仓库既有
  TSD-JSDoc warnings。installed package verifier exit 0；generated declarations/API HTML确认七个新属性；
  Sandcastle `build-gallery-no-embedding`成功处理307 examples。
- Static/audit：changed-scope ESLint/Prettier/Markdownlint、`git diff --check`通过；upstream audit通过，current delivery
  upstream-owned entries=`0`、generated status=`0`、SGP=None。AgentDocs scoped checks在最终回写后执行。
- 已解决偏差：public contract首轮仅因Jasmine object equality比较两个`NaN` alpha失败，改为逐RGB与`isNaN`证明
  alpha ignored；Widget hue首轮直觉期望不符合Cesium YIQ builtin，随后修正GLSL column-major矩阵解释并加入
  framebuffer normalized clamp，最终使用官方builtin数学与3/255容差通过。产品shader未为测试期望改变。
- Manual gate：项目负责人于`2026-08-12`在现有`scenegis-planar-imagery` Sandcastle确认验收通过；默认/reset、
  五项scalar filters、color-to-alpha controls、相机交互、credit与best-effort路径满足本phase人工gate。
- 剩余风险：完整uniform shape的硬件上限已在当前real Context证明，但未来baseline/hardware仍需升级复核；
  hue/gamma precision与color space只保证当前planar contract和测试容差。
- Architecture首轮review fixes：`S2-R001`通过Collection property-aware forwarding与Surface仅响应
  `removed`或`property === "show" && !layer.show`关闭；shown/hidden filter mutation均不再release或清空最近normal replay。
  新增Collection forwarding与settled hidden layer回归，七项filter mutation后、下一normal render前保持request/texture/
  binding/runtime counters、`surface._imagery.tilesLoaded`、`surface.tilesLoaded`、`world.tilesLoaded`及depth replay不变；下一normal
  render不请求hidden layer。Architecture为此批准Collection source/spec两条SceneGIS-owned路径，未修改private imagery runtime。
- `S2-R002`通过当前Widget real Context闭环：实际`MAX_TEXTURE_IMAGE_UNITS=16`、
  `MAX_FRAGMENT_UNIFORM_VECTORS=1024`；16个shown layers的完整uniform variant成功生成、链接、渲染，添加第17层后产品Surface
  在新增request/selection/shader mutation前fail-fast。初次测试从direct Source `ContextLimits`模块读取到初始化前`0`，改为从
  `widget.scene.context._gl`读取实际limit；产品effective limit仍由“16成功、17产品拒绝”行为闭环证明一致。
- `S2-R003`增加property-aware unit-range validator，threshold constructor/setter诊断准确命名
  `colorToAlphaThreshold`，并加入精确message断言；brightness/contrast/saturation/gamma四处`@exception`逻辑措辞已修正，
  existing alpha validator/message与accepted values不变。
- Review-fix focused结果：ImageryLayer include=`12/12`（Layer `7`、Collection `5`）；Surface aggregate=`37/37`；
  Imagery Widget=`12/12`。为取得精确GL limits曾加入一次临时诊断assertion并按预期得到`1 FAILED`，随后立即移除；最终工作树
  不含诊断代码，以上12/12 Widget结果为最终证据。
- Manual-gate blocker `S2-R004`：实际Sandcastle iframe证明原`.backdrop`没有positioning contract，controls/status被full-size
  canvas覆盖。仅修改既有demo `index.html`：controls/status显式`position:absolute`、`z-index:2`及自有background/border/padding；
  status固定在credit上方；controls使用viewport-relative `max-height`与`overflow:auto`，紧凑高度media rule进一步限制为
  `min(220px, calc(100% - 76px))`。
- R004 Chromium证据：代表视口controls/status hit-test分别命中overlay内`LABEL`与`DIV`，不再命中`CANVAS`；computed
  position=`absolute`、z-index=`2`，status与credit rect不重叠。紧凑视口controls `scrollHeight=247`、
  `clientHeight=218`，确认可滚动；brightness slider从`1`变为`0.2`后纯地图区域截图SHA-256由
  `77f833313d112803c0081d3523080f9b2cb8120f7b051ffe16605816377465dd`变为
  `c453bc13e8b9a6cfcc256c1e021f110b417bb588ba994d8c7cac3d26c47d4506`；console errors=`0`。代表与紧凑
  viewport截图均已检查；未修改engine、renderer或public API。
- Architecture独立复核R004：代表与紧凑iframe中controls/status均为`position:absolute`、`z-index:2`且命中overlay内部；
  compact controls可滚动、status与credit不重叠，brightness `1 -> 0.2`改变实际canvas pixels。唯一HTTP 404为
  `--no-embeddings`按预期未生成的外层`gallery/embeddings.json`，与Viewer、filters和rendering无关。
