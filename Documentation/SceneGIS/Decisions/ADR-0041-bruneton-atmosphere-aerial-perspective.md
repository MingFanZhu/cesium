# ADR-0041：Bruneton 大气、空中透视与双世界资源契约

## 状态

- Status：`approved`；planar single-scattering/resource sections partially superseded by ADR-0042
- Date：`2026-08-14`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md`
- Related discussion：
  `AgentDocs/atmosphere-clouds-effects/discussions/2026-08-14-a2-lut-and-planar-model.md`
- Related patch：active `SGP-0008`（A2只消费既有hook，不增加upstream hunk）
- Constrains：ADR-0030、ADR-0033、ADR-0034、ADR-0036、ADR-0039、ADR-0040
- Partially superseded by：ADR-0042（planar LUT、multiple scattering、ray/slab distance semantics与resource budget）

## 上下文与源码事实

A1 已在 `Scene.js` 建立 advanced background 与 pre-tonemap linear-HDR 两个 optional delegation，并发布 explicit
Globe/planar reference frame。A1 private pipeline inactive 时保持 texture identity；A2 不需要第二个 upstream file 或新的 pass slot。

`ControllerHost.update(scene, time)` 发生在 Scene 决定是否 render 之前。Planar Sun direction 已由 caller-owned
`SceneGISPlanarEnvironment` 使用同一 ControllerHost simulation time 发布；Globe 当前帧 Earth Sun direction 则在真正 render 时由
`UniformState.sunDirectionWC` 发布。因此 A2 的 Controller 负责 lifecycle/capability/resource，renderer 在 render slot 消费当帧
direction，不建立 system-time 或第二 astronomy authority。

Cesium `Texture3D` 要求 WebGL2；RGBA16F LUT 的线性采样还要求 `textureHalfFloatLinear`。`Scene.highDynamicRange` 只有在
depth texture 与 float/half-float color buffer 可用时生效。Aerial perspective 可以从 resolved depth 的 raw sample 通过
`czm_windowToEyeCoordinates` 重建 log/non-log、Perspective/Orthographic eye position；A1 HDR slot 已位于 AO/bloom/exposure/tone
mapping 之前。

`scripts/build.js#copyEngineAssets` 会把 `packages/engine/Source/**` 下非 JS/TS/GLSL/CSS/Markdown 文件保持相对路径复制到 engine
build 与 root `Source`；engine package 的 `files` 包含 `Source` 和 `Build/**`。Karma development route 已把
`Build/CesiumUnminified/Assets` 映射到 `packages/engine/Source/Assets`。因此不需要修改 build script 或 package manifest。

Architecture 对 `takram-design-engineering/three-geospatial` commit
`9c6dfd0054f077f3ad4695b802e74d4c6a814440` 的 `packages/atmosphere` 做了固定审计：二进制为 little-endian RGBA float16，尺寸为
256×64 transmittance、256×128×32 combined scattering、64×16 irradiance；`scattering.bin` alpha 已携带 single-Mie red，runtime
不需要另一个 8 MiB texture。三个文件共 8,527,872 bytes，固定 SHA-256 为：

- `transmittance.bin`：`A2A0DD1464048D92E7BFDF385A9108E8D9C3E2748684F1F64523587D5894180A`
- `scattering.bin`：`82C505FE6E3B7F1995C650CC8A1478F42BD510029BF63845E9485C078AEF6617`
- `irradiance.bin`：`126BD4FF0419E04C877639CAF9E3CD64A139AE511CF315A23A0C989FC47B51A5`

该 package `LICENSE` SHA-256 为
`32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B`，包含 Shota Matsuda MIT notice、Eric Bruneton
2017 BSD-3-Clause notice 与 INRIA 2008 BSD-3-Clause notice。用户指定参考实现 commit
`1f38602b84ab5c3f2bc289f9e4464df3db917155` 中对应 binary hash 相同，但它只作为 Cesium prototype 研究来源，不作为 A2 的
runtime/code authority。

## 决策

### Public Controller

A2 新增唯一 public `SceneGISEnvironmentEffects` Controller：

```js
const effects = new SceneGISEnvironmentEffects({
  mode: "globe", // or "planar"
  world, // required only for planar
  enabled: false,
  showAtmosphere: true,
  showAerialPerspective: true,
});
viewer.addController(effects);
```

- `mode` 必填且只接受 `"globe"|"planar"`；planar 必须提供 exact live `SceneGISPlanarWorld`，Globe 禁止提供 `world`。
- `enabled` read/write，默认 `false`；`showAtmosphere` 与 `showAerialPerspective` read/write，默认 `true`。A2 不公开任意 LUT、planet
  radius、physical coefficient、quality tier、temporal 或 cloud/fog/lens 参数。
- Readonly `mode`、`world`、`ready` 与 `errorEvent`；`errorEvent` 以 `(controller, error)` 报告一个 resource generation 的一次失败。
- Static `SceneGISEnvironmentEffects.isSupported(scene)` 只做 read-only capability preflight，不 attach、不 fetch、不 allocation。
- Controller 不成为 Scene/World property，不由 Scene/Viewer 拥有。Caller 在销毁 host 前先 `removeController`；disconnect 取消 generation、
  conditional detach 并销毁全部 Scene/Context-owned resource。Instance 可重新注册，不增加 public `destroy`。

Constructor option error 必须在 host mutation 前抛 `DeveloperError`。First active update 的 Scene/world/native/HDR/capability error 必须在
pipeline attachment、network 或 GPU mutation 前 fail-fast。Async fetch/decode/compile/allocation failure 保持 empty/last-good，令
`ready=false` 并只 raise 一次 `errorEvent`；`enabled=false -> true` 开始新 generation。首次成功后 disable 保留 warm resource，但停用
pipeline并请求一帧；从未启用的默认路径仍是零 network/GPU/command/listener/timer。

### Capability 与 fallback

Advanced A2 profile 是一个不可部分降级的 capability set：

- live `SCENE3D` Scene；
- WebGL2 与 `maximum3DTextureSize >= 256`；
- half-float texture、half-float linear filtering、depth texture 与 half-float color-buffer rendering；
- `scene.highDynamicRangeSupported === true`，且 active 时 caller 已显式设置 `scene.highDynamicRange === true`。

不支持时不降为 nearest LUT、RGBA8、WebGL1、post-tonemap stage 或错误几何模型。Fallback 是 caller 不启用/移除 advanced Controller，并继续
使用现有 native Globe environment 或 ADR-0036 lightweight planar environment；Controller 不替 caller 切换或恢复 fallback。

### Fixed preset 与 dual-world geometry

A2 只有 immutable `earth-bruneton-2017` physical preset：bottom radius 6,360 km、top radius 6,420 km，以及审计 manifest 中固定的
solar irradiance、Rayleigh/Mie/ozone density/scattering/extinction、ground albedo、Sun angular radius 与 luminance conversion。
Runtime visual property 不得使 coefficient 与预计算 LUT 脱钩。

- **Globe**：使用三个 combined RGBA16F LUT 与 Bruneton runtime functions。Cesium WGS84 geodetic altitude、local east/north/vertical 与
  view ray 被映射到固定 6,360 km virtual sphere；不把 WGS84 ellipsoid radii 假装成 LUT 预计算 radius。Physical sky 包含 Sun disk，
  aerial pass 使用真实 eye-space segment length 与 virtual sphere curvature。Camera 从地面到 atmosphere 外均须有限、稳定。
- **Planar**：不得采样 spherical LUT。使用同一 preset coefficients，在 `+Z`、base Z=0、top Z=60 km 的 flat slab 中做 bounded
  single-scattering view integration与解析/分段 optical-depth Sun transmittance；downward rays 使用 flat ground intersection，不制造
  curved horizon。Planar A2 提供相同 sky/Sun/aerial capability family，但不宣称 Bruneton multiple scattering 或与 Globe 像素等价。

两条路径都从 A1 snapshot 构造 Perspective/Orthographic ray。Aerial pass 只处理 resolved depth 可见的 opaque surface；clear-depth sky
保持 background pass 的输入不重复加雾。Translucent/OIT surface 没有独立 resolved translucent depth，是 A2 明确保留的后续 qualification
风险，不得宣称已经 geometry-exact。

### Native authority 与 conflict

Controller 不拥有或修改 `scene.light`。Globe 使用现有 Cesium Sun light/direction；planar 必须有 exact world 上 registered、enabled 的
`SceneGISPlanarEnvironment`，renderer 在 render 时读取其 readonly `effectiveSunDirection`。

Active Globe 要求 caller 关闭 native `SkyAtmosphere`、SkyBox、Sun/Moon visible body、`sunBloom`、Fog 与
`globe.showGroundAtmosphere`。Active planar 要求 ADR-0039 native guard 已成立，并关闭 lightweight planar SkyBox/atmosphere/Sun/Moon
visible output；Environment 仍保持 enabled 以发布 light/direction。任何 late conflict 先把 advanced pipeline fail closed，再通过
`errorEvent` 报告；不得销毁或恢复 foreign object。

### Render、depth 与资源所有权

- Background slot 最多执行一个 stable fullscreen command，写入当前 HDR scene target；Sun disk 与 atmosphere radiance在同一 pass合成。
- Aerial slot仅在 `showAerialPerspective` 时执行一个 fullscreen command，使用 raw depth +
  `czm_windowToEyeCoordinates`兼容log/non-log与 Perspective/Orthographic，输出
  `sceneColor * transmittance + inScattering`，保持 alpha，并返回新 color texture给 native postprocess。
- 一个 Controller/Context 最多持有一个 shared fullscreen VA、两个 shader programs、三个 Globe LUT texture 与一个 aerial color-only
  `FramebufferManager`。Planar 不分配 LUT；关闭 aerial 不分配 FBO。禁止 raw `context._gl`、PBO、second render loop或 permanent listener。
- LUT 直接以 `Uint16Array`/`PixelDatatype.HALF_FLOAT` upload，不 decode 成 `Float32Array`。上传成功后释放 CPU ArrayBuffer。
- FBO 按 input color texture 尺寸创建 RGBA16F candidate；resize/compile/upload 全部成功后才替换 current，失败保留 last-good 或 identity。
  不允许 texture feedback、in-place partial publication或 destroy foreign input/depth/id texture。

Persistent binary LUT 为 8.13 MiB。1920×1080 RGBA16F aerial output 为 15.82 MiB，Globe A2 persistent texture上限约 23.95 MiB；
3840×2160 为 63.28 MiB output、总计约 71.41 MiB。Planar 不含 8.13 MiB LUT。A2 不增加 temporal/history/noise volume。

### Asset、license 与 package delivery

新 owned root 为：

```text
packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/
```

只提交 `transmittance.bin`、combined `scattering.bin`、`irradiance.bin`、`provenance.json` 与完整 `LICENSE.txt`。Importer 位于
`scripts/scenegis/`，接受 caller 指定 source directory，验证 exact commit资料、长度、SHA-256、format/dimensions与 license hash后原子写入；
不包含 downloader、不记录本机路径、不读取临时 clone作为隐式输入。

Runtime 固定通过 `buildModuleUrl("Assets/SceneGIS/Environment/BrunetonEarth/...")` 获取 package-local asset。验证必须覆盖 source route、
development/release build、engine/root npm tarball的 public export、types与实际 asset bytes/license/provenance；生成 GLSL `.js`、Build、pack
临时目录不得提交。

Bruneton-derived GLSL 文件必须保留完整 Eric Bruneton BSD-3-Clause header，并在源码注释写明 fixed source commit/path；不得移植
three.js wrapper、GUI、runtime downloader或 raw WebGL helper。

## 不采用的方案

### 五个独立 LUT、运行时 half-to-float decode

不采用。Separate single-Mie 与 higher-order texture 会把 binary/GPU LUT 从 8.13 MiB 增至约 24.13 MiB；decode 为 Float32 还会再次翻倍
CPU/GPU压力。Combined scattering 已提供 A2 runtime 所需 single-Mie reconstruction；higher-order separation 留给实际 cloud-shadow/god-ray
需求重新审计。

### Planar 直接使用 spherical LUT

不采用。把 planar Z 映射成 virtual radius 会制造 curved horizon、有限地球曲率与错误的长距离 optical path，违反 explicit planar frame。
Planar 采用独立 flat-slab single-scattering，并明确与 Globe quality差异。

### 运行时从 GitHub/CDN 下载 LUT

不采用。它会把可用性、CORS、版本、hash 与离线部署交给外部状态，并使 npm/root build 无法自包含。

### 自动关闭并恢复 native effects

不采用。Native object 与状态属于 caller；自动接管会在 late replacement、多个 Controller 或异常 detach 时覆盖 foreign authority。

## 上游补丁、升级与移除

A2 只消费 active `SGP-0008`；`Scene.js` 两个 A1 range及 patch manifest不应改变。若实现需要第二个 upstream file、扩大 hook、修改
`PostProcessStageCollection`/Renderer/build script/package manifest，Execution 必须停止并提交 Architecture discussion。

升级 Cesium 时复核 `Texture3D` half-float upload/filter、`Context` capability getters、FramebufferManager color-only/RGBA16F、Texture public
dimensions/datatype、`buildModuleUrl`/`copyEngineAssets`、Karma Assets proxy、ControllerHost/UniformState order、raw/log depth clear value、
inverse projection与 pre-tonemap hook texture identity。

## 验证

- Public API、constructor/first-update guards、`isSupported`、default-zero-cost、warm disable/re-enable、disconnect/re-register、request-render、
  generation cancellation、errorEvent once与 duplicate pipeline Specs。
- Asset importer/manifest/hash/length/license、no Float32 expansion，以及 dev/release/root/installed npm真实 URL与byte identity。
- Real Context pixel tests覆盖 Globe/planar sky/Sun/aerial、clear depth identity、ground/horizon/high altitude/space、Perspective/Orthographic、
  HDR ordering与 show flags；失败注入覆盖fetch/decode/compile/FBO resize的candidate/last-good/destroy balance。
- Command/texture/VA/program/FBO固定预算、resize与多次 connect/disconnect resource balance；inactive 不增加 command/FBO/texture。
- `Scene.js` aggregate regression、upstream audit只允许既有`Scene.js`/SGP-0008、generated status=`0`。
- 中文 `Test/**` 双世界 direct page完成项目负责人manual gate后，Architecture才批准A2 checkpoint与A3 activation。

## 参考资料

- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial fixed source commit](https://github.com/takram-design-engineering/three-geospatial/tree/9c6dfd0054f077f3ad4695b802e74d4c6a814440/packages/atmosphere)
- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere)
