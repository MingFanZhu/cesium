# E4 Review：平面大气与 SkyBox

## Metadata

- Status：`approved`
- Date：`2026-08-13`
- Phase：[E4 phase plan](../plans/2026-08-13-phase-e4-planar-atmosphere-skybox.md)
- Reviewer：Architecture Agent
- Commit/push：None；working tree intentionally uncommitted
- ADR：`ADR-0036` approved
- SGP：None；current E4 upstream-owned files=`0`；只读依赖既有`SGP-0003`

## Review request

请复核：

- Environment E4 defaults、strict validation、clone/reference no-op、active requestRender、native conflict与caller ownership。
- `SceneGISPlanarSkyBox`六面preloaded same-type contract、fixed planar axes、CubeMapPanorama return-command seam和exactly-once caller destroy。
- fullscreen atmosphere的planar camera ray、day/twilight/night、height fade、one VA/one SP/one command/zero texture生命周期。
- World固定SkyBox→atmosphere→Sun/Moon→ordinary geometry顺序、resident-terrain underground统一隐藏与native background opaque mask。
- E1-E3 authority/Clock/body contract、default-hidden fast path、installed delivery、direct Test中文lil-gui与ownership是否保持。

## Exact changed paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarSkyBox.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarAtmosphereRenderer.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCelestialBodyRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarAtmosphereVS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarAtmosphereFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarSkyBoxSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarAtmosphereRendererSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRendererSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Test/平面环境.html`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0036-planar-atmosphere-skybox.md`
- `AgentDocs/planar-environment/README.md`
- `AgentDocs/planar-environment/plans/2026-08-13-planar-environment-extension.md`
- `AgentDocs/planar-environment/plans/2026-08-13-phase-e4-planar-atmosphere-skybox.md`
- `AgentDocs/planar-environment/reviews/README.md`
- `AgentDocs/planar-environment/reviews/2026-08-13-e4-planar-atmosphere-skybox.md`

共24个E4 paths。用户自有未跟踪`Test/地形.html`未读取、修改、暂存或纳入delivery。

## Implementation and deviations

- 新SkyBox wrapper只保存frozen face-reference snapshot，复用`Matrix3.IDENTITY`与return-command seam，不进入Scene-owned
  `skyBox/skyAtmosphere` slots；replacement、clear、Environment/World/Scene destroy均不destroy caller SkyBox。
- Atmosphere renderer只在实际显示时两阶段创建并发布固定资源；uniform/time/camera/terrain mutation保持warm identity，default hidden
  与只显示SkyBox路径不分配atmosphere GPU resource。
- World一次发布共享planar pose/terrain-height state，供atmosphere与E3 celestial renderer使用；underground路径统一抑制planar visual，
  并仅在已经执行native generic background时用同一stable command进行opaque mask。
- Real Context证明local cubemap、atmosphere、bodies和terrain真实compile/link/draw，以及late native atmosphere conflict、pick/depth、
  above/underground、warm identity与caller ownership。未增加第二render path、pass、texture、FBO或asset。
- Implementation与confirmed phase plan无行为偏差；E4未产生upstream diff，不新增SGP或ADR以外的长期契约。

## Validation evidence

| Command / evidence                                                                            | Result                                                                                    |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarEnvironment"`                    | TOTAL 23 SUCCESS；含inactive authority/native conflict/requestRender                      |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSkyBox"`                         | TOTAL 4 SUCCESS；含square/same-size faces与strict Credit validation                       |
| `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISPlanarAtmosphereRenderer"`    | TOTAL 4 SUCCESS；hidden/candidate/frusta/Context/destroy                                  |
| `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRenderer"` | TOTAL 6 SUCCESS；共享pose/underground seam及既有projection/resource contract              |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                          | TOTAL 23 SUCCESS；environment ordering与renderer ownership                                |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"`       | TOTAL 10 SUCCESS；real Context composition/conflict/underground/pick-depth/warm lifecycle |
| `npm run build`、`npm run build-release`                                                      | passed                                                                                    |
| `npm run build-ts`、`npm run build-docs`、`npm run tsc`                                       | passed；build-ts只有既有TSD-JSDoc warnings                                                |
| `node scripts/scenegis/verify-planar-packages.mjs`                                            | passed；12/12 GLSL、12/12 generated modules、E4 runtime/declarations/API与private hiding  |
| changed-scope ESLint/Prettier/Markdownlint、`Test/**` Prettier、`git diff --check`            | passed；GLSL无Prettier parser，保持authored source并由build/link验证                      |
| `node scripts/scenegis/audit-upstream-patches.mjs`、generated/exact status audit              | passed；current E4 upstream-owned=0、SGP=None、generated=0                                |

未运行full suite、E2E、Sandcastle gallery、公网成功或无关terrain/content suites，符合phase plan。Architecture批准前未请求
project-owner visual/manual gate。

## Findings

| ID      | Severity | Status    | Finding                                                                                                                                                                                                                                                                                                                  | Resolution                                                                                                                                                                                                                |
| ------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E4-R001 | P1       | addressed | `SceneGISPlanarSkyBox`只检查每个face各自具有正的`width/height`，没有在public constructor中拒绝非正方形或六面尺寸不一致的输入；底层`CubeMap`要求所有face同尺寸且`width === height`，因此当前对象可以构造成功、赋给active Environment并在首个render才抛错，违背本phase的strict constructor validation/fail-fast contract。 | Wrapper构造期现在先拒绝非正方形首面，再要求其余五面与首面尺寸完全一致；non-square与mismatched-size Specs均通过，sources snapshot与caller ownership未变。                                                                  |
| E4-R002 | P1       | addressed | `options.credit`额外接受仅含`html/showOnScreen`的duck-typed对象，但公开类型只承诺`Credit\|string`；该对象会被`CubeMapPanorama`原样保留，`CreditDisplay.addCreditToNextFrame`随后调用不存在的`credit.isIon()`并在真实render路径产生`TypeError`。                                                                          | Constructor现严格只接受`Credit\|string\|undefined`；Credit-shaped plain object与普通object均在构造期拒绝，真实`Credit`和string仍通过。                                                                                    |
| E4-R003 | P1       | addressed | 项目负责人manual gate截图显示SkyBox存在贯穿天空的明显竖直接缝。`Test/平面环境.html`为六个face分别生成不同的上下线性渐变，相邻face公共边缘没有共享texel颜色；fullscreen atmosphere只做连续的半透明source-over，无法消除底层cubemap断层。这是direct Test资源生成错误，不是应由提高atmosphere opacity掩盖的shader问题。     | Test内六面现在先填充统一edge color，只在半径24px的内部radial区域加入低对比face tint，再显式覆盖四条1px边缘；startup Canvas assertion逐像素验证六面所有border pixels（含corners）完全一致。等待项目负责人重新manual gate。 |

## Execution response to findings

- E4-R001：修复仅位于public SkyBox validation；所有六面在创建`CubeMapPanorama`前完成square/same-size preflight，避免首帧延迟失败。
- E4-R002：删除非公开duck-typing扩展，JSDoc exception与runtime保持一致，防止非法credit进入GPU/update路径。
- E4-R003：仅修改`Test/平面环境.html`的六个generated canvases；共同edge color与显式四边覆盖保证tint影响在所有边缘严格为零，
  启动时`getImageData`逐一检查六面全部border RGBA并在任何差异时fail-fast。六面仍为独立local canvases，内部中心色保留轻微轴向差异。
- Focused revalidation：SkyBox `TOTAL 4 SUCCESS`；scoped ESLint/Prettier、AgentDocs Markdownlint、`git diff --check`与官方
  upstream/generated audit通过。未重跑Widget/render/build/package或视觉检查，符合Architecture限定边界。
- R003 validation：Test HTML Prettier、deterministic Canvas border assertion静态审计与现有root server短headless smoke通过；browser
  实测六面各252个border pixels均只有同一RGBA `27,45,74,255`，lil-gui与live SkyBox存在且page errors=0。AgentDocs
  Markdownlint、`git diff --check`与official upstream/generated audit通过；未修改或重跑任何产品代码/Spec/build/package。
  项目负责人仍需刷新页面重新视觉验收。

## Architecture conclusion

- `approved`。E4-R001/R002均已关闭：public SkyBox现在在构造期保证六面为同类型、同尺寸正方形，且
  `credit`严格限制为`Credit|string|undefined`，不会把底层`CubeMap`或`CreditDisplay`错误延迟到首帧。
- Atmosphere renderer、fixed shaders、World内SkyBox→atmosphere→Sun/Moon顺序、native conflict、地下mask、caller-owned
  SkyBox与GPU resource lifecycle通过Architecture/code review，未发现其他阻塞项。
- Architecture接受Execution记录的focused/build/release/types/docs/installed/audit证据；R001/R002复核源码与Specs，R003复核
  direct Test cubemap生成与确定性边缘断言，未重复执行产品测试或代替项目负责人进行视觉判断。
- 首次项目负责人manual gate发现E4-R003：direct Test六个独立linear-gradient face在公共边缘颜色不一致，产生明显cubemap竖直接缝。
  Architecture已复核并接受local generated faces的窄修复：六面公共edge color一致，内部radial tint在边缘前已回落到公共底色，且startup assertion逐像素锁定全部border RGBA；
  不需要重开产品renderer/shader设计。项目负责人刷新后已确认接缝消失，并于`2026-08-13`通过E4最终manual gate。
- E4 Architecture、自动化与manual gates全部关闭；由Architecture创建独立中文local checkpoint后，才可建立E5联合资格与交付phase plan。
