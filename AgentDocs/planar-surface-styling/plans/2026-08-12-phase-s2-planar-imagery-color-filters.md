# Phase Plan: S2 Planar Imagery Color Filters

## Metadata

- Plan type: `phase`
- Status: `active`
- Parent plan: [planar-surface-styling extension](2026-08-12-planar-surface-styling-extension.md)
- Phase: `S2`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Related discussions: 项目负责人提出平面 `ImageryLayer` 对齐球面常用颜色滤镜
- Related reviews: None; Execution 在 ready-for-review 时新建
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

- Implementation status: not started。
- Validation: not run。
- Review: not created。
- Manual gate: pending implementation and Architecture approval。
