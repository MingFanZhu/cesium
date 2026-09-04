# atmosphere-clouds-effects

## Status

- Extension: `active`
- Current phase: `A13-G active; Globe performance investigation`
- Current review: `diagnostic assignment only; no optimization implementation authorized`
- Current phase plan:
  [2026-09-04-phase-a13g-globe-performance.md](plans/2026-09-04-phase-a13g-globe-performance.md)
- Previous completed phase plan:
  [2026-09-04-phase-a12g-globe-cloud-noise-reduction.md](plans/2026-09-04-phase-a12g-globe-cloud-noise-reduction.md)
- Extension plan:
  [2026-08-14-atmosphere-clouds-effects-extension.md](plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Architecture decisions:
  [ADR-0040](../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md),
  [ADR-0042](../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0043](../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md),
  [ADR-0044](../../Documentation/SceneGIS/Decisions/ADR-0044-separate-background-aerial-radiance-calibration.md),
  [ADR-0045](../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md),
  [ADR-0046](../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md),
  [ADR-0047](../../Documentation/SceneGIS/Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md),
  [ADR-0048](../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md),
  [ADR-0049](../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md),
  [ADR-0050](../../Documentation/SceneGIS/Decisions/ADR-0050-globe-readable-night-skylight.md),
  [ADR-0051](../../Documentation/SceneGIS/Decisions/ADR-0051-globe-native-moon-composition.md),
  [ADR-0052](../../Documentation/SceneGIS/Decisions/ADR-0052-planar-integrated-medium-restoration.md),
  [ADR-0053](../../Documentation/SceneGIS/Decisions/ADR-0053-globe-moonlight-shadow-surface.md)
- Upstream patches: active `SGP-0008`（consume only）、active `SGP-0009`（A5/A11 Globe surface seam）
- Branch: `feature/atmosphere-clouds-effects`
- A1 checkpoint: `a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`（未push）
- A2 checkpoint: `da2eb55743a46423e65b2047965907c05ea260b7`（未push）
- A3 checkpoint: `43ed40117104e0450bf23dc094b2ab2e602bbfa2`（未push）
- A4-G checkpoint: `241de41fc36835114a4e9312ad53ca2ac64407b8`（未push）
- A5-G checkpoint: `3ead681e7854082b6b9d016fdcd9cd8619087102`（未push）
- A6-G checkpoint: `201f6edada8fe2738bf9eb3277a30ea3b519e7d7`（未push）
- A7-G checkpoint: `6f70b54c80ce174bf7befe49fe37262230288e61`（未push）
- A8-G checkpoint: `eee8a8bbb241c2e71dc68397a6b324faa670862c`（未push）
- A9-G checkpoint: `f8d655ab75baf95b1421eddb35489a6a9d9dd62e`（未push）
- A10-G checkpoint: `6afba87af181f3cdb7a20aff09b81af11eb302f4`（未push）
- A11-G checkpoint: `53465cf9bc8f3af1e935b3225c81364e380ea528`（未push）
- A12-G checkpoint: `fd868387d4c38d6faf67a9395434cc9fccc6384c`（未push）

## Objective

为 Cesium Globe 与 `SceneGISPlanarWorld` 建立同等级的现代环境渲染能力：physically based atmosphere、aerial
perspective、exponential height fog、volumetric clouds、cloud shadows、crepuscular rays（god rays）以及
HDR bloom/lens flare。两种世界共享光学参数、质量档、资源与合成框架，但分别使用 ellipsoid-radial 与 fixed-axis planar
reference frame，不互相伪造坐标语义。

## Active work

- A13-G starts from the accepted A12 checkpoint and first investigates cost,
  without lowering the accepted quality or changing product code. The current
  high/mixed page with OSM Buildings provides a short frame-cadence and CPU
  sample, not per-pass GPU timing. Execution must return a source-backed cost
  map and at most three ranked proposals before implementation is assigned.
  See [A13 discussion](discussions/2026-09-04-a13g-globe-performance-source-discovery.md)
  and [A13 review](reviews/2026-09-04-a13g-globe-performance.md).
- A12 RGB/transmittance correction and bounded Spec repairs have passed
  Architecture review. The last aggregate remains `78/79`; its one failed
  time-matrix fixture now passes `1/1` after the approved Spec-only repair.
  Automated qualification is closed without claiming an unrun `79/79`.
- The owner removed mandatory same-view comparison and explicitly permits
  near-view fine grain. Architecture loaded and inspected the final candidate,
  retaining the original parameters/time and restoring the camera afterward.
  Cloud structure remains visible, with residual fine grain and no obvious
  broad trail in the bounded drag/stop inspection. The owner explicitly accepted
  the current grain strength; A12 is complete. See
  [A12 review](reviews/2026-09-04-a12g-globe-cloud-noise-reduction.md).
- A12-G addresses the owner's newly reported cloud grain after the A11 gate
  passed. The current full-resolution, 500-step Globe path already advances
  STBN and uses stationary history weight `0.9`. The first bounded change is
  reference-derived variance clipping within the existing 3x3 resolve; no
  shape, light/shadow, sample budget, resource, API or Planar change is allowed.
  See [source discovery](discussions/2026-09-04-a12g-globe-cloud-noise-source-discovery.md)
  and [review](reviews/2026-09-04-a12g-globe-cloud-noise-reduction.md).
- A11-G is complete from frozen A10-G product checkpoint
  `6afba87af181f3cdb7a20aff09b81af11eb302f4`. The project owner corrected the
  accidental Planar route before P1 review and defined “Moon shadow” as
  directional Moon-light shadowing on terrain, 3D Tiles and models. ADR-0053
  adds one camera-independent ECEF Sun/Moon primary-light authority, a stable
  controller-owned `DirectionalLight`, reuse of the Scene-owned native
  `ShadowMap`, the existing SGP-0009 Globe surface seam, and one pinned
  `2048 x 1024` NASA CGI Moon Kit color asset on the caller-owned native Moon.
  It adds no second light/shadow/body, no lunar eclipse, no displacement shader,
  no new SGP and no Planar execution.
- P1 Planar integrated-medium restoration is deferred before Architecture
  review or owner acceptance. Its design record remains valid and its
  unaccepted candidate is preserved outside committed delivery, but neither is
  part of the A11-G baseline.
- A10-G is complete from frozen A9-G checkpoint
  `f8d655ab75baf95b1421eddb35489a6a9d9dd62e`. Source discovery confirms that
  Cesium already owns the Moon texture, physical ellipsoid, Simon1994 position,
  IAU orientation, Sun-only phase lighting, culling and Globe occlusion. The
  current advanced sample hides that native object, while `SGP-0008` draws the
  opaque advanced background after the native Moon and therefore covers it.
  ADR-0051 reuses caller-owned `scene.moon`, moves the existing advanced
  background slot before the native Moon command, and permits that single Globe
  body exception. No Moon copy, public controller option, moonlight, new asset,
  SceneGIS GPU resource, new SGP or Planar behavior is authorized.
  Execution and Architecture review now pass. Independent production evidence
  is render-slot `5/5`, Globe Moon acceptance `1/1` and Planar Moon rejection
  `1/1`; the upstream audit reports only `Scene.js` under existing `SGP-0008`,
  generated `0`, new SGP `0`. A fresh fixed page shows the caller-owned native
  textured crescent centered above the horizon at azimuth `257.917 degrees`,
  elevation `7.443 degrees`, Sun `-20.120 degrees`, with zero browser/render
  errors. The project owner explicitly passed the visual gate; A10-G is closed
  with no open finding. Moonlight, Moon shadows and alternate Moon assets remain
  inactive; the separately activated P1 Planar phase is recorded above.
- A9-G is closed at local checkpoint
  `f8d655ab75baf95b1421eddb35489a6a9d9dd62e`, which remains unpushed. It started from frozen A8-G checkpoint
  `eee8a8bbb241c2e71dc68397a6b324faa670862c`. The project owner selected one
  Globe `readable` night result and explicitly rejected a two-style product.
  ADR-0050 adds one fixed blue-gray hemispherical source in the A2 irradiance
  domain, transitioning by each receiver/sample's local solar elevation from
  zero at `-6 degrees` to full at `-12 degrees`. Terrain, cloud body/ground
  bounce/haze and height-fog ambient consume the source; direct Sun, Beer
  shadows, rays, background sky, exposure, Models/3D Tiles and Planar remain
  frozen. The phase adds no public property, uniform, resource, upstream hunk or
  SGP. Architecture code review passed, but the project owner judged the first
  result too dark. The closed `A9-AR-001` changed only the private source constant from
  `vec3(0.010, 0.018, 0.030)` to its exact 2x value
  `vec3(0.020, 0.036, 0.060)`; chromaticity, local `-6/-12 degree` transition,
  consumers and every frozen boundary remain unchanged. Architecture independently
  re-ran the production GPU fixture and reopened the same fixed owner gate.
- A8-G is closed. Architecture accepts the final A8 delivery and all findings
  through `A8-AR-034`; the project owner explicitly passed the final interactive
  Globe cloud-shadow gate on 2026-09-02. The accepted fixed-time result keeps
  the cloud-shadow field registered to terrain while the camera pitch changes.
  The phase-closing commit is the isolated local A8-G checkpoint and is not
  pushed. No successor phase is active in this checkpoint.
- The project owner rejected `A8-AR-014`: only the lower cloud altitude was a
  visible improvement; cloud morphology and in-cloud transport still do not
  match the local `three-geospatial` reference, and cloud shadows still move
  materially under camera rotation. Architecture therefore supersedes the
  earlier proxy-parity conclusion with `A8-AR-015`. The source audit found an
  exact default extinction-domain mismatch (`0.005` versus the reference low
  layer coefficient `0.2`), non-reference detail LOD and secondary Sun/ground
  schedules, tangent-local rather than actual ECEF irradiance positions, and a
  shadow system that still uses Euclidean cascade selection, a moving
  camera-footpoint osculating shell and incomplete two-dimensional cascade
  matrices. The correction must restore the reference material/transport and a
  single world/ECEF producer-receiver coordinate authority before any temporal
  shadow stabilization is accepted. Architecture does not modify product code
  in this assignment turn.
- The owner identified that the direct reference assets still produced flatter
  shapes and insufficient thickness-dependent shading. `A8-AR-011` fixes the
  three confirmed integration causes in the Globe preprocessor path: each
  authored layer remains independently saturated but overlapping densities are
  summed, the existing `32x1 / 64x4` tier budgets are scheduled as bounded
  progressive `50/100 m -> 1000 m` samples with conservative empty-space
  advance, and shape/detail LOD follows projected pixel footprint rather than
  integration step length. Planar retains its prior uniform nested march.
  Focused real-GPU material, LOD, occupancy and schedule fixtures pass; the
  first aggregate run left 75 checks green and exposed only one obsolete exact
  RGB comparison, whose corrected half-float-aware focused fixture passes.
  API, resources, upstream paths, generated source status and SGP scope are
  unchanged. Final reference similarity remains an owner visual judgment.
- The project-owner comparison with the fixed local
  `three-geospatial@b012ad06` view opened `A8-AR-010`: Globe still collapses
  the authored reference data into an approximate SceneGIS texture hierarchy,
  models default cumulus as one thick layer, and omits the existing Beer atlas
  from cloud-body Sun transport. The owner rejected that approximation. The
  bounded correction now imports the pinned shape/detail/weather/turbulence/STBN
  payloads directly with exact SHA-256 provenance and MIT notice, mode-selects
  them only for Globe, and restores overlapping reference layers, short local
  Sun detail plus non-overlapping BSM remainder and one ground-bounce sample.
  Runtime texture/request counts, public API/defaults, quality sample counts,
  A5 receiver semantics, A6 history, A7, Planar, upstream-owned paths and SGP
  scope remain frozen. Focused GPU, aggregate controller/pipeline, installed
  package and static validation pass; Architecture review and one fixed owner
  view remain pending.
- A8-G已从冻结A7-G checkpoint单独激活并通过Architecture code/delivery review。项目负责人明确不保留独立导航页，因此`高级环境.html`直接作为Globe发布样例，`高级环境-平面.html`保留Planar样例，两者互链；不存在`高级环境-球面.html`。页面统一使用本地`lil-gui 0.21.0`，Planar只做启动/导航保留，不构成产品资格或视觉gate。`A8-AR-001`至`A8-AR-004`已全部关闭：既有SGP-0009 JSDoc同时通过真实`build-ts`/`tsc`，release E2E实际加载`Build/Cesium/Cesium.js`，发布页移除private MRT readback，quality action逐次点击只前进一档。Focused Specs、development/release build、API docs、installed package、SGP audit与Architecture独立release E2E均通过；A8运行时资源/API增量为零。当前只等待项目负责人六个固定Globe观察的视觉判断。
- Architecture复审关闭`A8-AR-001`并要求修正`A8-AR-002/003/004`。同一focused E2E现通过既有`cesiumPage`分别加载真实Unminified/release public bundle，并验证公开Globe controller与terrain-depth lifecycle；Globe发布页已删除private Cloud MRT readback、临时FBO及所有`_pipeline/_resources/_ownsGlobeDepthTestLifecycle`读取；质量观察改为每次owner点击只推进`medium -> low -> high -> medium`的一档。Finite/storage继续由已接受的自动化资格证据承担，不在release UI轮询。Architecture独立release E2E=`1/1 passed`，三项finding已关闭，owner gate现已开放。
- `A8-AR-002/003/004`修正后的development与PowerShell-scoped release focused E2E各`1/1`通过。Direct Globe smoke为ready/HDR、errors=`0`，连续三次质量点击分别停留`low/high/medium`；retained Planar smoke为ready/HDR、deferred、errors=`0`。未重跑Architecture已接受的Specs/build/type/package/SGP矩阵，产品/API/resource/upstream/generated边界无变化。
- A7-G已从冻结A6-G checkpoint单独激活。ADR-0049在既有`SGP-0008` linear-HDR slot末端增加half-resolution bright threshold、fixed separable blur、
  additive bloom与Sun ghost/halo；terrain/geometry使用resolved exact-clear depth遮挡，cloud遮挡复用final HDR signal。A7固定为two half-resolution加one
  full-resolution color-only RGBA16F targets，不使用public `PostProcessStage`、raw WebGL、asset、history、screen blend、第二tone mapper、A8-G或Planar执行。
- A7-G Architecture correction review已关闭`A7-AR-001/002`：two half-resolution targets在initial/resize allocation后显式使用existing linear sampler；
  composite恢复fixed nine mirrored ghost offsets/colors、aspect-correct chromatic halo与cubic ring。Architecture独立复跑localized-source actual-GPU fixture为
  `1/1 SUCCESS`，forced `Sampler.NEAREST` mutation与finite-depth ghost suppression均有直接authority。A7 code review通过，只剩项目负责人固定画面人工验收。
- Project owner点击`A7 可见高日`后无法验收，因为static `#a7gEvidence`成为`main`第三个grid row：Architecture direct reproduction中JSON row为
  `355.977 px`，Globe viewer被压缩到`127.656 px`。`A7-AR-003`只修复Test evidence为right-side bounded fixed overlay；A7 product、capture字段、参数与已关闭
  shader findings保持冻结。
- Architecture独立复核已关闭`A7-AR-003`：同一`1600 x 900`页面点击前后`.worlds`与Globe viewer均保持`483.6328125 px`，evidence为fixed、
  scrollable且完全位于右侧world区域。A7-G全部code/Test findings已关闭，owner visual gate重新开放。
- Project owner随后拒绝固定高日照画面：Bloom把Sun扩成axis-aligned white square，lens flare footprint过小。Architecture重新审计固定
  `three-geospatial`源，确认reference以multi-level blur处理Bloom、以独立pre-blur形成feature source，而current single H/V blur压缩了两个scale
  domain。`A7-AR-004`已下发固定`1/2/4`三octave ping-pong correction；保持public intensity、Sun radiometry、program/command object/FBO/bytes、
  A2-A6、Planar与SGP不变，仅把active blur execution从2次扩展为6次。Owner re-gate、checkpoint与A8-G继续blocked。
- Architecture独立检查并重跑聚焦GPU fixture=`1/1 SUCCESS`，已关闭`A7-AR-004`产品修复；但fresh `1600 x 900`页面单击`A7 可见高日`后，
  `799 x 483.6328125` Globe viewport内实际没有Sun或lens artifact。Test源码仍把相机设为`heading=0/pitch=-5°` ground view，未对准
  67.484° live Sun。`A7-AR-005`只修正这两个high-Sun Test witness使用既有live-Sun ENU alignment；产品、参数、证据字段与below-horizon state冻结。
- Architecture独立复核已关闭`A7-AR-005`：最小Test helper保持A5原语义，只为两个A7 high-Sun按钮在相同15°E/45°N、500 m位置对准live Sun；night
  path不变。Fresh `1600 x 900`单击后Sun位于完整Globe viewport中心，原axis-aligned bloom方块消失，形成连续soft field。A7-G全部code/Test
  findings关闭；Bloom softness与分离ghost/halo balance只等待项目负责人人工判断。
- Project owner确认Bloom跨越terrain silhouette可视为合理screen-space optical spread，但判定lens halo过淡。Architecture冻结Bloom与depth行为，并以
  fixed reference coefficient ratio定位`A7-AR-006`：current default feature-to-bloom ratio为`0.0002`，reference为`0.001`。只把
  `lensFlareIntensity`默认值从`1.0`校正到`5.0`即可精确恢复比例；禁止参数sweep、GLSL/Bloom/resource/Planar改动。Owner re-gate、checkpoint与A8-G
  继续blocked。
- Architecture独立复核已关闭`A7-AR-006`：constructor/JSDoc、既有default Spec、installed-delivery expectation与Test control完整采用`5.0`，显式`2.0`
  lifecycle、`[0,64]`range、internal `1e-5`、Bloom与resources保持不变。独立constructor-contract Spec为`1/1 SUCCESS`；同一default-5画面现仅等待
  project-owner visual re-gate。
- Project owner已对default-5最终画面明确报告`通过`，接受Bloom跨terrain silhouette的screen-space optical spread与增强后的lens halo/ghost balance。
  A7-G Architecture review和owner visual gate全部关闭；本阶段形成独立本地checkpoint，不push。A8-G等待单独Architecture activation。
- A6-G已通过Architecture review与项目负责人动态人工验收。ADR-0048只演进A4R既有two-target Cloud history，为bounded Globe camera/cloud motion增加
  world-position reprojection，并把A5 shadow length保持在同一semantic history authority内；`cloudQuality`继续是唯一caller-owned动态档位。
  第二套Beer history、velocity MRT、automatic FPS与额外GPU resource category均未增加；该checkpoint现已冻结。
- A5-G已经完成Architecture review、owner visual gate与独立checkpoint。ADR-0047的current-frame RGBA16F Beer atlas、`SGP-0009`最小Globe
  surface seam、A2 Sun/sky surface lighting、packed shadow length与terrain-depth lifecycle全部冻结。
- A1 已实现并通过 Architecture/code review：双阶段 render integration、private pipeline lifecycle 与 globe/planar
  reference-frame contract。
- A2经过A2R、A2R2与A2R3修正后，implementation、Architecture review和第四次project-owner visual gate均已通过；本次A2
  独立本地checkpoint关闭该阶段。
- A3首轮Architecture review的两个blocker均已由Execution修复并通过Architecture独立复审：Planar近水平短segment使用float32稳定的指数积分比，
  direct Test对`Scene.renderError`、有限有序frustum、新成功帧与Cesium error panel执行严格门禁；A3已
  `approved`，项目负责人live visual gate已明确通过。
- A4已基于checkpointed A3 renderer、MRT capability、asset/package边界以及fixed reference commits完成source-based planning。Frozen scope是
  single-deck dual-world cloud core、deterministic local assets、bounded low-resolution raymarch、A2/A3-aware composition与caller-owned motion；
  `A4-AR-002`已关闭且product visual已达到Architecture下限；第二次re-review发现的`A4-AR-006`已通过geometry-free structure capture、
  clouds-off exact identity和ordinary geometry visibility invariance关闭；但project-owner live visual gate随后因低质量噪声团块、缺少多云型和
  Globe/Planar opacity/color严重分歧而失败。Project owner现已批准ADR-0046 A4R revision：四种typed cloud preset、内部最多四层、
  reference-quality assets/turbulence/STBN、bilateral + minimum cloud-only temporal resolve及dual-world matched radiometric contract。A4R执行已激活；
  `A4-AR-010`的actual compiled matched core、16-phase real-asset distribution与weather/CDF authority已经通过独立source复核。2026-08-27第六次独立复审关闭
  `A4-AR-013/017`：conservative max hierarchy与actual-runtime mip failure atomicity均通过source、Specs和live visual下限。Architecture复跑controller/A1为
  `63/63`、exact Scene aggregate `127/127`。Execution已完成Architecture授权的real-Context constant -> ray -> density -> lighting分阶段replay：
  both worlds × two frusta × linear/log × four presets、same owner与independent A/B MRT及fixed real-asset phase全部raw exact。完整depth copy/hash又把集成差异定位到
  resolve的implementation-dependent `exp2` weight rounding；current shader改用固定16次幂有理bilateral weight，并把stationary映射为与invalid相同的
  shader-facing spatial-only state。两次cache-busting clean load各经过合法grid transition并连续执行两次diagnostic，四次both-world均为
  `fixed=0`、`captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`与cloud gates PASS。Architecture第七次独立复审又复跑
  controller/A1=`63/63`、exact Scene aggregate=`127/127`，并在two clean loads的four transactions/`40`组paired reads中复现全部raw exact；
  `A4-AR-011/016`已关闭。Display-grid的Planar cumulus edge在两次load为`2.175/2.179`，只作为observational range，不再冒充bit-exact
  runtime authority。随后project-owner live visual gate以三张final-source截图拒绝当前画面：both-world horizon/cloud出现断带，downward aerial与
  height fog出现viewport-wide分层。Source review把`A4-AR-018`定位到A4新增的near-sentinel clear-depth epsilon classifier，并把
  `A4-AR-019`定位到错误geometry distance被固定250 m cloud binary reject放大。A4只执行focused source fix和固定俯视/horizon验证，不跑full suite、不做
  防御性fallback。A4-AR-021进一步把shared semantics收敛为resolved depth texture raw exact `0/1`唯一sentinel authority；`czm_readDepth`只用于finite
  geometry reconstruction。Exact controller=`57/57`且A4-AR-020 assertion保持通过。A4进入`review-ready`，等待
  Architecture独立复审；checkpoint与A5继续blocked。
- Project owner在`A4-AR-023/025`的owner visual re-gate再次判定No-Go。Architecture已按owner授权下载ADR固定的两个MIT参考提交并完成
  source/visual audit；`A4-AR-026`把根因收敛到cloud-lighting结构，而不是A2单位或最终亮度：current sky ambient相对reference core高约一个数量级、
  缺少layer-height gradient，higher-order Sun scattering被各向同性化并再次放大，current powder又以Sun-path optical depth增亮direct，方向与reference
  local-extinction edge suppression相反。A4恢复`changes-requested`；Execution只可重建shared lighting core与focused evidence，不得改density/assets、
  occupancy/log-depth、public API、最终RGB/tone mapping或进入A5。

## Discussions

- [A13-G Globe performance investigation](discussions/2026-09-04-a13g-globe-performance-source-discovery.md) — `open; diagnostic only`
- [双世界环境渲染架构与参考项目取舍](discussions/2026-08-14-dual-world-render-architecture.md) — `resolved`
- [A2 LUT 资产与 planar atmosphere 模型](discussions/2026-08-14-a2-lut-and-planar-model.md) — `resolved`
- [A3 default height-fog washout](discussions/2026-08-15-a3-default-fog-washout.md) — `resolved`
- [A4 cloud structure calibration](discussions/2026-08-15-a4-cloud-structure-calibration.md) — `reopened by owner visual No-Go`
- [Globe-first advanced environment delivery](discussions/2026-08-27-globe-first-delivery.md) — `resolved; A4-G active`
- [A4-G Globe cloud whiteness and frequency calibration](discussions/2026-08-27-a4g-cloud-whiteness-frequency-calibration.md) — `design resolved by Architecture; implementation assigned`
- [A5-G shadow, skylight, and rays source discovery](discussions/2026-08-28-a5g-shadow-skylight-rays-source-discovery.md) — `resolved; A5-G completed`
- [A5-G owner visual corrections](discussions/2026-08-28-a5g-owner-visual-corrections.md) — `resolved; owner accepted`
- [A6-G temporal and performance source discovery](discussions/2026-08-28-a6g-temporal-performance-source-discovery.md) — `resolved; A6-G active`
- [A7-G HDR bloom and lens flare source discovery](discussions/2026-08-28-a7g-hdr-bloom-lens-flare-source-discovery.md) — `resolved; A7-G active`
- [A8-G qualification and delivery source discovery](discussions/2026-08-31-a8g-qualification-source-discovery.md) — `resolved; A8-G activated`

## Reviews

- [A13-G Globe performance review](reviews/2026-09-04-a13g-globe-performance.md) — `pending diagnostic report`
- [A1 render foundation implementation review](reviews/2026-08-14-a1-render-foundation.md) — `approved`
- [A2 Bruneton atmosphere and aerial perspective implementation review](reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md) — `approved`
- [A3 exponential height fog implementation review](reviews/2026-08-15-a3-exponential-height-fog.md) — `approved`
- [A4 volumetric cloud core implementation review](reviews/2026-08-15-a4-volumetric-cloud-core.md) — `changes-requested; superseded by A4-G`
- [A5-G Globe cloud shadows, skylight, and crepuscular rays review](reviews/2026-08-28-a5g-globe-cloud-shadows-skylight-rays.md) — `accepted; closed`
- [A6-G Globe temporal stabilization and performance review](reviews/2026-08-28-a6g-globe-temporal-stabilization-performance.md) — `accepted; closed`
- [A7-G Globe HDR bloom and lens flare review](reviews/2026-08-28-a7g-globe-hdr-bloom-lens-flare.md) — `accepted; closed`
- [A8-G Globe qualification and delivery review](reviews/2026-08-31-a8g-globe-qualification-delivery.md) — `A8-AR-002/003/004 correction review ready`

## Engineering paths

- A1 integration/private frame：`packages/engine/Source/Scene/Scene.js`、
  `packages/engine/Source/SceneGIS/Scene/_private/`
- A2 public/private runtime：`packages/engine/Source/SceneGIS/Scene/`、
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- A2 assets/importer/generator：`packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/`、
  `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/`、`scripts/scenegis/`
- A4 assets/generator：`packages/engine/Source/Assets/SceneGIS/Environment/CloudCore/`、`scripts/scenegis/`
- Specs/manual page：`packages/engine/Specs/SceneGIS/Scene/`、`Test/高级环境.html`

## Current handoff

A12-G is accepted and frozen at
`fd868387d4c38d6faf67a9395434cc9fccc6384c`. The owner requested performance
investigation next. A13-G currently authorizes only read-only source/reference
analysis and writeback to its records; product, Specs, Test UI, assets, tiers,
light/shadow semantics and Planar remain unchanged. The
[A13 phase plan](plans/2026-09-04-phase-a13g-globe-performance.md) is the current
assignment authority. Execution returns a bounded diagnostic report; it does
not implement, commit, push or reopen old accepted visual findings.

## Historical handoff — A4

Architecture fresh diagnosis已把owner可见云断层的主因定位到SceneGIS explicit `R8` occupancy mip upload：base width `128`选择
`UNPACK_ALIGNMENT=4`，tight-packed LOD6 `2³`上传时被错误解释为4-byte row stride并在GPU保持全零。Execution已按正式派工保留tight max
hierarchy，只对显式mip upload副本补齐base alignment要求的3D row/image stride；GPU LOD5/6/7现均非零且parent conservative，accelerated cloud MRT与
exhaustive-density reference在both worlds逐bit一致。并行log-depth defect也已修复：三个自有log variants同时定义`LOG_DEPTH`与
`LOG_DEPTH_READ_ONLY`，raw exact `0/1`继续是唯一geometry-presence authority，finite geometry由`czm_readDepth`得到的resolved depth通过
conventional-depth `vec4` overload重建eye coordinates。

Architecture独立source、real-Context与local Chromium复审已关闭`A4-AR-022`，状态为`Go for project-owner visual re-gate`。Execution exact
controller=`59/59`、A1 pipeline=`7/7`；Architecture独立新增回归=`2/2`。Fresh browser GPU audit确认both-world LOD5/6/7全部nonzero、三个actual selected
log programs均包含两个defines，ground与downward固定画面未复现原始row-wide discontinuity。Current repair只修改five SceneGIS-owned product/Spec
files并回写current A4 docs；upstream-owned=`0`、generated=`0`、new SGP=`0`，active `SGP-0008`仍consume-only。GPU texture/program/pass/API/asset预算
不变，temporary CPU padding delta=`+11 bytes`。Full suite、Scene aggregate及generator/package/type/build矩阵按派工未运行；tree未commit/未push，
owner visual gate、checkpoint与A5继续blocked。

Project-owner再次以`medium/cumulus`、day、`cloudTime=0`、`cloudRadianceScale=1`拒绝A4视觉gate，Architecture新增`A4-AR-023/024`。Execution
actual-GPU probe先确认高日照backward direct Sun欠能量，随后又证明初版additive lobe会重复创建angular energy。Current phase先把forward/backward HG
coefficients写成解析归一化形式，再以`0.25 HG mixture + 0.75 normalized backward diffusion`作非负凸组合；解析积分为`1`，256点GPU quadrature=
`0.997459`，additive mutation=`1.990521`并确定失败。Backward/side/forward phase为`0.19019/0.04990/1.30957`。

Controlled top backward direct/multiple/ambient现为`[0.158,0.138,0.119]`、`[0.126,0.111,0.095]`、
`[0.104,0.125,0.166]`，集成为`[0.388,0.374,0.379]`；underside仍为`[0.204,0.231,0.291]`。Same-final-source fixed
Sun-camera live backward/side/forward中位亮度Globe/Planar为`0.354/0.342`、`0.239/0.214`、`1.357/1.320`，且actual cosine分别为
`-1/0/1`。普通below/inside/above、four presets、sunset/night及cloud-only/combined evidence均已刷新。Isolated component/angular=`1/1`、exact
controller=`60/60`、A1 pipeline=`7/7`。Implementation为`review-ready`，tree仍uncommitted/unpushed，owner gate、checkpoint与A5继续blocked。

Architecture随后关闭`A4-AR-024`但以`A4-AR-025`继续阻塞蓝灰云。Execution用actual-GPU Sun-only、sky-only、combined矩阵确认A2 adapter incident
单位正确；失衡位于shared view-independent diffuse partition。Current shared core保持normalized phase冻结，在分量源头显式采用
`solar multiple × 1.48`与`sky ambient × 0.8`。最终标准云上median Y Globe/Planar=`0.3147/0.2955`，`B/G=1.078/1.069`，
D65 xy distance=`0.0096/0.0081`；fixed forward median/p90相对accepted phase baseline均小于`+5%`。Isolated diffuse=`1/1`、
controller=`60/60`、A1=`7/7`。A4-AR-023/025现为`review-ready`，仍等待Architecture复审；tree未commit/未push，owner gate、checkpoint与
A5继续blocked。

Architecture独立source、actual-GPU fixture与fresh local Chromium复审现已关闭`A4-AR-023/025`。独立标准ground median Y Globe/Planar=
`0.2877/0.2689`，标准above=`0.3123/0.3009`，above `B/G=1.080/1.065`；fixed forward median/p90保持accepted normalized-phase `+5%`内。
A4状态为`Go for project-owner visual re-gate`。Owner明确通过前tree继续uncommitted/unpushed，checkpoint、commit/push与A5保持blocked。

上述owner re-gate现已失败，latest authority为`A4-AR-026`。固定reference source与checked-in example images证明current component rebalance在数学上过度
填充sky/isotropic energy，亮度与D65门槛不再作为closure。Execution的新边界是reference-shaped shared lighting reconstruction与component/contrast
evidence；所有其他A4 owners冻结，tree继续uncommitted/unpushed。

Project-owner A4-AR-025 visual re-gate为No-Go，Architecture新增`A4-AR-026`并完成两套MIT reference equation audit。Execution已按派工重建candidate shared
lighting：normalized dual-HG `g=(0.7,-0.2)` equal mix、8-octave phase-preserving Kulla approximation、`1/(4π)` density-weighted active-layer gradient sky，
以及基于local extinction的`1-0.8 exp(-σₜ·150 m)` powder。Actual-GPU fixture与独立CPU equation、incident separation及三类旧缺陷mutation全部通过。

但same-source live触发派工的radiometric stop condition：canonical medium/cumulus云上median Y仅`0.02976/0.03048`，owner exact high/mixed云上仅
`0.02755/0.02463`；除forward外的ground/inside/back/side也集中在约`0.02-0.04`。Candidate reference equations约比A4-AR-025 accepted-source能量低一个
数量级，不能用hidden final scale补偿。Architecture现已接受reference-shaped source equations，并以ADR-0046 amendment明确
`cloudRadianceScale`是solar-normalized cloud result到Cesium scene-linear HDR的唯一公开校准：default从`1.0`修正为`10.0`、range保持`[0,64]`，
且不与background/aerial scale耦合。Current state=`changes-requested; A4-AR-026 default calibration repair assigned`；tree仍未commit/未push，owner gate、
checkpoint与A5 blocked。

Execution现已完成Architecture授权的A4-AR-026 calibration correction：public/JSDoc/Test `cloudRadianceScale` default为`10.0`，range继续`[0,64]`，
accepted reference-shaped shader source没有再变化。Actual compiled Globe/Planar linear/log scale `0/1/10` fixture证明RGB linear、zero identity、
transmittance/distance half-bit invariant及cloud/background/aerial calibration隔离。Same-final-source default-10 canonical与owner-exact固定矩阵全部
`nonfinite=0`、storage guard=false，最大premultiplied RGB=`3.1328125`；sunset保持`R>G>B`，no-moon night exact zero，cloud-only forward保留内部暗部。
Exact focused controller加A1 pipeline=`68/68 SUCCESS`。Current state=`review-ready; Architecture independent re-review pending`；tree仍uncommitted/unpushed，
owner gate、checkpoint与A5 blocked。

Architecture独立复审接受A4-AR-026的product correction与`61/61 + 7/7` actual rerun，但新增blocking evidence finding `A4-AR-027`：Test MRT
summary在alpha非finite时直接skip而不计数，新scale fixture也只证明RGB finite，alpha/distance仅比较相等bits，因此相同NaN可以错误通过并使交付的
`nonfinite=0`结论fail-open。Latest review writeback另未通过Prettier。Current state=`changes-requested; A4-AR-027 focused evidence repair assigned`；
Shader/source equations/default contract不重开，owner gate、checkpoint与A5继续blocked。

Execution已完成A4-AR-027 focused evidence repair。Test helper现在先解码每个pixel的完整color/distance RGBA half values，分别报告color/distance/union
nonfinite count，并以所有pixel的absolute raw premultiplied RGB计算storage guard；alpha、distance与validity bounds也显式报告。Actual-GPU scale
`0/1/10` fixture逐scale证明color RGBA与distance/front/max/validity全部finite且在编码范围内，同时保留bit invariance、RGB linearity与calibration
isolation。Fresh unchanged default/camera/light/density capture两世界的full-color/full-distance nonfinite均为`0`，raw absolute maximum=`0.379638671875`。
Current state=`review-ready; A4-AR-027 Architecture re-review pending`；product source保持冻结，owner gate、checkpoint与A5继续blocked。

Architecture独立复跑isolated calibration=`1/1`、controller=`61/61`、A1 pipeline=`7/7`，并确认完整color/distance RGBA finite/bounded authority、
absolute raw RGB guard、ESLint、Prettier、Markdownlint与`git diff --check`全部通过。`A4-AR-027`关闭，A4 technical state=
`approved-for-owner-gate`。Project-owner需在当前final-source页面重新判断默认与owner-exact画面；明确通过前tree继续uncommitted/unpushed，checkpoint与A5
保持blocked。

Project-owner在Planar同时启用exponential height fog与volumetric clouds后拒绝该gate：画面出现大面积白色背景与错误cloud/fog层序。Architecture以
`A4-AR-028`撤销此前owner-gate授权；截图只构成visual No-Go，不冒充root-cause evidence。Owner随后明确改变交付顺序：先完成并验收全部Globe高级
环境能力，之后再恢复Planar。Architecture已核验固定Cesium reference commit并把它提升为Globe实现authority，同时继续禁止raw `_gl`、PBO、runtime
network fetch与重复tone mapping。Active phase现为[A4-G](plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md)；retained dual-world tree冻结且
未commit/未push，Planar defect明确deferred，A5-G仍blocked。

Execution已完成A4-G reference-first Globe core候选。逐文件source/license/texture audit见
[A4-G source map](discussions/2026-08-27-a4g-reference-source-map.md)；因opaque binary缺少独立file-level生成provenance，没有复制reference资产，继续使用
SceneGIS deterministic CloudCore。Globe compiled source现采用reference cube-sphere weather、layer/profile、shape/detail/turbulence与erosion结构，shared transport
继续使用accepted A2 Sun/sky、8-octave scattering、local powder、bounded march与单次A3 composition。集成时发现并修复WGS84 ECEF magnitude被误当Bruneton
cloud altitude的unit seam：现在先投影到`SCENEGIS_BOTTOM_RADIUS`再叠加ENU offset。Planar不编译新Globe library且未做产品校准。

Actual-GPU reference probe、lighting mutation、scale附件、controller=`62/62`、A1=`7/7`、CloudCore generator=`10/10`、installed package/provenance=
`23/23`均通过。Test新增明确的A4-G Globe owner-gate六组合态与ground/inside/above/near-space固定机位；fresh browser遍历后Globe保持
`ready · HDR`，cloud-only/fully-combined未见viewport-wide white/gray slab。远景云仍偏柔与低频，保留为owner visual risk。Current state=
`changes-requested; A4-AR-029 open`。Architecture独立复核发现primary/Sun march把WGS84 surface的地心径向误当成参考实现要求的椭球
geodetic normal；45度纬度下会把Globe texture phase平移约`21.4 km`。Cube-sphere face选择又使用strict dominant-axis比较，精确tie会错误落到Z face；
现有GPU probe只直接调用赤道density/lighting helper，绕过两条错误链路。独立direct probe=`1/1`、controller=`62/62`及4 camera × 6 state
browser smoke仍通过，但不足以证明reference-coordinate correctness。Tree继续uncommitted/unpushed，owner gate、checkpoint与A5-G blocked，等待
Execution已完成A4-AR-029窄修复：primary与Sun march现在共享geodetic-normal bottom-sphere anchor，cube-sphere face选择匹配inclusive
Y-then-X tie order。Actual-GPU boundary mutation=`1/1`、45度WGS84 integrated Cloud MRT mutation=`1/1`、controller=`64/64`、A1=`7/7`、
generator=`10/10`、installed/provenance=`23/23`通过；accelerated/exhaustive attachment bit-exact，geocentric mutation被确定性拒绝。Final-source
Globe browser覆盖equator/45度 × ground/inside/above/near-space × 六组合态，共`48`帧且error=`0`。低频灰带风险未用scale/tint/camera/Sun隐藏，
仍留给后续owner判断。Current state=`review-ready; A4-AR-029 repair awaiting Architecture re-review`；tree继续uncommitted/unpushed，owner gate、
checkpoint与A5-G blocked。

Architecture现已独立关闭`A4-AR-029`：共享geodetic-normal anchor、inclusive cube-face tie order、45度WGS84 integrated mutation authority及
Planar冻结边界均通过源码复核。独立GPU/controller/A1=`1/1 + 1/1 + 64/64 + 7/7`，CloudCore generator=`10/10`，installed
delivery/provenance=`23/23`；final-source equator/45度 × 四机位 × 六组合态为`48/48 ready · HDR`且browser error=`0`。Current state=
`approved-for-project-owner-Globe-visual-gate`，但远景云仍偏柔和低频，必须由项目负责人明确判断；在此前tree继续uncommitted/unpushed，checkpoint、A5-G与
全部Planar排查/校准保持blocked。

Project-owner现判定该Globe visual gate为No-Go并授权适度增强，`A4-AR-030`成为新的blocking finding：云层仍过灰，远景仍偏柔、低频。Architecture已接管并
完成reference live comparison、参数sweep和方案裁决。A4-G的东经15度/北纬45度owner机位继续使用通用`04:00Z day`，实际太阳高度仅`6.229°`；所谓
`10:30Z sunset`反而是`67.484°`高太阳，这是暖灰证据被错误标注的第一原因。独立高太阳sweep仍确认public scale `24`偏灰，`48`在真实Cesium PBR Neutral
下达到cloud-only median RGB `230/224/218`且保留暗腔，`64`开始压平高光。Globe LOD `1.0 -> 0.5`使interior five-pixel high-pass提高`17.3%`，而`0.35`
只再增加`3.7%`并在低太阳下暴露ray-aligned banding。正式实现已收敛为：保留macro scale `0.25`、LOD改`0.5`、public default改`48.0`、新增location-aware
high-Sun/sunset/night owner inputs；accepted solar-normalized source与全部资源/transport/depth/history边界冻结。Current state=
`changes-requested; A4-AR-030 converged implementation assigned`；tree仍uncommitted/unpushed，owner re-gate、checkpoint、A5-G与Planar排查继续blocked。

Execution已按收敛方案完成A4-AR-030：Globe macro保持`0.25`、LOD改为`0.5`、public/JSDoc/Test/package default改为`48.0`；旧Spec-local
scalar ACES已删除，改由actual-compiled raw interior gradient/Laplacian/high-pass与真实Cesium PBR Neutral显示取证。GPU scale=`0/1/48`、
cube-face、45度WGS84、controller=`65/65`、A1=`7/7`、generator=`10/10`、package/provenance=`23/23`全部通过。Final-source high-Sun
cumulus/mixed 16-row matrix全部finite，raw max=`1.34375`、display max=`0.9765`；45度机位太阳高度精确报告`67.484/2.175/-20.120°`，sunset
保持`R>G>B`，night raw cloud为零，resolved attachment非连续重放bit-exact。Current state=`review-ready; A4-AR-030 awaiting Architecture re-review`；
tree仍uncommitted/unpushed，owner re-gate、checkpoint、A5-G与Planar排查继续blocked。

Architecture独立复审接受A4-AR-030产品实现与自动化边界：Globe macro=`0.25`、LOD=`0.5`、public default=`48.0`及冻结的source/transport均
正确，独立GPU/controller/A1/generator/package验证全部通过；真实high-Sun画面已接近白云且保留暗腔，sunset与night也符合契约。但新增Test-only
blocking evidence finding `A4-AR-031`：位于A4-G控件组的四预设网格仍以通用`currentArtifactMode`命名并控制primitive visibility，导致选择A4-G
`Cloud only`后仍显示`combined`并混合Globe/Planar不同状态；display replay又只比较全帧hash，独立四帧采样出现最多`1`个8-bit LSB、约`2.11%`
pixel的Cesium最终显示量化抖动，raw color/distance attachment仍bit-exact。Current state=`changes-requested; A4-AR-031 Test evidence repair
assigned`；产品JS/GLSL、默认值、资源与Planar继续冻结，owner re-gate、checkpoint、A5-G仍blocked。

## External references

- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) — fixed commit是Globe功能拓扑与逐文件
  license/provenance审计后实现移植的首选authority；其raw WebGL/runtime fetch/PostProcess容器不直接进入产品。
- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

## Handoff rule

本索引只保存当前稳定状态。Phase 结果、偏差、验证、upstream-owned files、SGP 与未解决风险必须回写当前 phase plan 和
review；原始聊天、绝对路径、临时 clone 与大型日志不得写入 AgentDocs。

## A4-AR-031 execution state — review-ready 2026-08-27

The Test-only evidence repair is complete. The A4-G four-preset capture is now
explicitly Globe-only and records the owner location, camera, lighting, owner
state, quality and fixed preset order. `a4gCloudOnly` hides only Globe
primitives; the retained Planar controller and primitive visibility are
snapshotted before/after and remain unchanged.

Displayed replay now reports dimensions, changed pixels/fraction, maximum
channel delta, p10/median/p90 deltas, truthful `displayExact`, and fail-closed
`displayStable`. It compares two ordered groups of four nonconsecutive samples
from a repeatedly observed, bit-exact resolved-attachment phase. High-Sun,
true-sunset and no-moon-night captures passed exact color/distance replay and
bounded display stability with zero browser errors.

Product JS/GLSL, defaults, API, resources and Planar behavior were not changed.
The shared tree remains uncommitted/unpushed; owner gate, checkpoint and A5-G
remain blocked pending Architecture re-review.

Architecture复审接受Globe-only网格、可见state label、Globe primitive隔离和Planar before/after不变证据，但拒绝当前replay gate并新增
`A4-AR-032`。24帧协议会按raw attachment hash分组、选择出现最多的phase，再把其余帧任意标成`stateApplicationFrames`排除；独立首次采集的替代
phase一直出现在index `6/10/13/17/20`，并非连续的状态应用前缀。无warm-up量化中，未选phase相对主phase有`219392`个color half-word与
`38087`个distance half-word变化，display变化`8368/577005` pixels、maximum one LSB；当前helper仍可报告raw exact/display exact。相同产品在显式连续
收敛后`24/24`帧只剩单一raw/display hash，故finding继续限于Test调度与fail-closed证据协议。Current state=`changes-requested; A4-AR-032
contiguous convergence evidence repair assigned`；产品和Planar保持冻结，owner re-gate、checkpoint、A5-G继续blocked。

## A4-AR-032 execution state — review-ready 2026-08-27

Replay evidence no longer groups or selects attachment phases. After disabling
the default render loop, it drains pending RAF work, performs eight explicit
controlled convergence renders, and then searches within the bounded 64-render
budget for one uninterrupted 16-frame run. Any raw color/distance mismatch or
bounded-display mismatch resets the candidate run. Only the single contiguous
prefix before the accepted run is excluded; every accepted and intervening
frame is part of the exact/stable authority.

Final high-Sun/sunset/night captures converged with prefix lengths `22/8/10`
and accepted original indices `22-37`, `8-23`, and `10-25`. Each accepted run
had one color hash, one distance hash, one display hash, stationary history with
read index zero, exact raw attachments, and `displayStable=true`. The Globe-only
preset grid additionally uses immutable `snapshot.ownerState`, validates all
owner controls after capture, and reports `valid=true` only when owner and
Planar snapshots remain unchanged.

Only Test evidence and current A4-G records changed. Product/Planar remain
frozen; owner gate, checkpoint, commit/push and A5-G remain blocked pending
Architecture re-review.

## Architecture A4-AR-032 re-review — changes requested 2026-08-27

The submitted 16-frame raw-exact convergence gate is not reproducible in the
independent high-Sun run: the bounded 64-render helper failed closed with two
raw Cloud MRT phases. Same-frame inspection showed that the Globe default loop
was stopped, `frameNumber` did not change during reads, and low Cloud MRT,
resolved attachments and final display changed together. The final display
difference remains within the previously accepted one-LSB stability bound.

Architecture therefore withdraws strict multi-frame raw replay as an
over-validation of the owner-visible result. `A4-AR-032` remains Test-only and
now requires one atomic same-frame display/raw capture per explicit owner state,
finite/bounds and visible quality summaries, plus the already accepted immutable
Globe snapshot and Planar isolation. Convergence loops, phase selection,
multi-frame hash gates and replay pair matrices must be removed. Product and
Planar remain frozen; state=`changes-requested; simplified A4-AR-032 evidence
repair assigned`.

## A4-AR-032 simplified execution — review-ready 2026-08-27

Architecture withdrew strict multi-frame raw identity as stronger than the
owner-visible contract. Execution therefore removed every replay, hash, phase,
warm-up and convergence gate from the A4-G owner evidence. Each selected owner
state now performs exactly one controlled render; its `postRender` callback
copies both the actual final framebuffer and raw Cloud MRT attachments before
resolving, and summaries are computed only from those completed copies.

Fresh high-Sun, true-sunset and no-moon-night captures were finite, within raw
attachment bounds and storage-safe. Their immutable owner snapshots remained
valid; sunset stayed `R > G > B` and night raw cloud RGB remained exact zero.
The accepted Globe-only grid and Planar before/after isolation remain unchanged
and `valid=true`. Product/Planar stay frozen; owner gate, checkpoint, commit/push
and A5-G remain blocked pending Architecture re-review.

Architecture复核确认已启用的单帧原子路径正常，但发现一个最小fail-open：页面初始disabled状态调用helper时会返回
`raw.available=false`，顶层却仍为`valid=true`。A4-AR-032继续changes-requested，仅允许把`valid`绑定到现有
controller ready、raw available/finite/bounds/storage与owner snapshot结果；不得新增采样、hash或gate。产品与Planar继续冻结。

## A4-AR-032 final fail-closed execution — review-ready 2026-08-27

The single-frame helper now computes its raw summary once and derives `valid`
only from controller enabled/ready, unchanged owner state, raw availability and
finiteness, zero existing nonfinite/bounds failures, and a clear storage guard.
Exactly two direct invocations confirmed disabled/not-ready returns
`raw.available=false, valid=false`, while enabled/ready high-Sun cloud-only
retains every raw check and returns `valid=true`. No render, wait, retry, hash,
replay, metric, product or Planar behavior was added or changed.

Architecture independently reproduced both direct outcomes on the final source
and accepts the simplified evidence implementation. `A4-AR-032` is closed;
product and Planar remain frozen. A4-G now awaits project-owner visual judgment,
with checkpoint, commit/push and A5-G still blocked.

The project owner subsequently reported `通过` on the live Globe result. The
A4-G visual gate is accepted and this change set is the local unpublished A4-G
checkpoint. A5-G has not been activated; Planar adaptation remains deferred.

## A5-G execution — review-ready 2026-08-28

Execution implemented the bounded current-frame Beer shadow atlas, inherent
Globe Sun/sky surface lighting through active `SGP-0009`, and semantic
crepuscular shadow-length transport. The public warm booleans default to true;
native `globe.enableLighting` conflicts fail before A5 allocation. The atlas is
one RGBA16F texture/FBO/program with no depth or history: low and medium use
2,097,152 bytes, while high uses 8,388,608 bytes.

Focused actual-GPU transport, Globe surface, controller, A1, upstream surface,
generator, package/provenance and browser evidence passed. The fixed browser set
reported finite/storage-safe raw Cloud MRT, high-Sun surface separation, warm
sunset source `R > G > B`, exact-zero night cloud source and no render errors.
Planar behavior, A4-G assets/equations, generated files and resource categories
outside the specified atlas remain unchanged. State=`review-ready`; no owner
gate, checkpoint, commit, push or A6-G work was requested.

## A5-G Architecture review — changes requested 2026-08-28

Independent review accepted the bounded resource/ownership seam but found three
direct data-contract blockers: atlas front depth uses an incompatible ray origin
and exceeds `RGBA16F` range, clear/invalid cloud pixels discard crepuscular
shadow length, and the SceneGIS fallback surface normal is geocentric rather
than WGS84 geodetic. `A5-AR-001`, `A5-AR-002` and `A5-AR-003` are open.

The repair is limited to relative normalized front depth, validity-independent
clear-ray length transport and the WGS84 fallback normal, with one focused GPU
assertion for each. No broad matrix, additional resource, Planar work, owner
gate, checkpoint, commit/push or A6-G work is authorized.

## A5-G correction execution — review-ready 2026-08-28

Execution repaired only the three reviewed contracts. Atlas R is now measured
from `segmentStart`, normalized by 200 km on write and decoded to metres at the
receiver. The view-ray BSM integral now runs once per bounded coarse interval,
independent of density/occupancy/cloud validity; invalid-cloud pixels may carry
positive length through spatial/history resolve and into clear/finite/cloud
atmosphere plus directional-only fog. The SceneGIS no-terrain surface branch now
uses WGS84 inverse-radii-squared through one shared helper.

Each requested focused GPU assertion passed 1/1, as did the three directly
affected prior fixtures. Resource/API/pass/program/texture/FBO/history counts,
Planar behavior and the three-path `SGP-0009` boundary are unchanged. State is
`review-ready` for Architecture re-review; the findings remain recorded until
Architecture closes them.

## A5-AR-002 fog correction — review-ready 2026-08-28

The Globe clear-depth Aerial branch now adds the difference between real
shadowed and zero-length `sceneGISApplyExponentialHeightFog` evaluations using
the same base color and parameters. Shared color, transmittance and ambient terms
cancel, so only the directional fog source changes; zero length remains exact
identity and fog is not composed twice.

The replacement GPU fixture directly compiled the production Bruneton,
CloudShadow and HeightFog stack from packed `valid=false` plus 100 km length.
Directional fog was lower than zero length, while directional-scale-zero
ambient output was bit-identical. The existing packed fixture also passed 1/1.
No resource, API, Planar, SGP or Test-page boundary changed.

## A5-G correction Architecture re-review — changes requested 2026-08-28

Architecture independently closes `A5-AR-001` and `A5-AR-003`. The normalized
segment-relative atlas depth and WGS84 fallback normal are correctly connected,
and their focused GPU fixtures pass.

`A5-AR-002` remains open only because clear depth still skips the actual A3
height-fog consumer. The delivered helper fixture cannot detect this: it tests
packing and a scalar directional factor, not Aerial/fog composition. The final
repair is limited to a clear-depth shadowed-minus-unshadowed fog delta and one
direct actual height-fog/Aerial GPU assertion. All other boundaries remain
frozen.

## A5-G final Architecture correction review — passed 2026-08-28

Architecture independently accepts the clear-depth fog delta and closes
`A5-AR-002`. The replacement production-stack GPU fixture and packed identity
fixture each passed 1/1; the three-path `SGP-0009` audit also remains clean.

All A5-G technical findings are closed. Public API, atlas/resources, pass and
history counts, Planar behavior and upstream scope are unchanged. The phase now
waits only for the project-owner Globe visual gate; checkpoint, commit/push and
A6-G remain blocked.

## A5-G project-owner visual gate — changes requested 2026-08-28

The project owner rejected the Globe result for five concrete visible defects:
cloud-shadow mosaic, black twilight ground, a returned downward aerial layer
line, invisible crepuscular rays, and a Test surface without Cesium imagery or
terrain selection. Architecture reproduced the decisive toggles and opened
`A5-AR-004` through `A5-AR-008`.

The converged repair is limited to a 3×3 transmittance-domain tent PCF with
`256/512/768` BSM tiles; public Globe-only `surfaceRadianceScale=10`; a
transmittance-driven Globe finite-aerial asymptote; one live-Sun-aligned
Globe-only rays owner preset using visible `0.6/4` fog controls; and an
offline-first Globe layer selector with Natural Earth II, optional official
Cesium World Imagery + World Terrain, and solid diagnostic modes.

No new pass/program/texture/FBO/history, upstream path, asset download, Planar
product behavior or A6 work is authorized. Validation remains the five direct
fixtures/states in the active plan rather than a full matrix, hash, replay or
convergence gate. A5-G is `changes-requested`; owner re-gate, checkpoint,
commit/push and A6-G remain blocked.

## A5-G owner-correction execution — review-ready 2026-08-28

Execution completed the exact converged code and Test surface: Beer-space 3×3
PCF with `256/512/768` tiles, public warm `surfaceRadianceScale=10`, the Globe
finite-aerial extinction asymptote, a live-Sun-aligned rays preset, and the
offline-first Natural Earth II / optional Cesium online / solid selector.

Focused GPU, controller, A1, Globe surface, installed delivery and `SGP-0009`
audits pass. No new upstream path, generated file, SGP, asset or render-resource
kind was added. The browser evidence remains finite and storage-safe, but the
downward profile still has a `0.400905` step and the aligned rays off/on
percentiles are identical. Execution stopped without an unapproved workaround;
Architecture review and owner re-gate remain blocked pending judgment of those
two direct visual facts.

## A5-G owner-correction Architecture review — changes requested 2026-08-28

Architecture closes `A5-AR-004`, `A5-AR-005` and `A5-AR-008` after source
review and independent 1/1 passes for the Beer-space PCF and surface/aerial GPU
fixtures. Those paths are frozen.

`A5-AR-006` remains open only because the returned evidence is invalid: the
120 km/`-8°` center ray is above the ellipsoid horizon, and 33 sparse displayed
samples have no resolved-depth classification. Execution is assigned one fixed
ground-intersecting, same-frame color/depth observation; the accepted product
asymptote is unchanged.

`A5-AR-007` remains open because A3 fog still maps decoded metres with
`exp(-L/200000)`, making kilometre-scale shadows too weak. ADR-0047 now requires
the same final-shadowed-segment semantics as Bruneton, evaluated through the
existing height-density optical-depth integral. Closure uses one focused fog
fixture and one fixed integrated local observation only; no broad matrix,
replay/hash machinery or parameter search is authorized.

## A5-G bounded 006/007 execution — review-ready 2026-08-28

Execution keeps the accepted finite-aerial formula unchanged and replaces the
invalid sparse profile with one 120 km/`-20°` same-frame color/depth boundary.
The center column transitions directly from finite depth `0.876953125` at
`y=348`, luminance `0.803154`, to exact-clear depth `1` at `y=349`, luminance
`0.818690`.

A3 Globe fog now interprets decoded length as the final shadowed subsegment and
weights directional Sun by the unshadowed/total height-density optical-depth
ratio. The production-source GPU fixture passes for zero, partial, full and
ambient-only cases. At the fixed aligned sunset state (`coverage=0.65`,
`cloudTime=0`), rays-on resolves 3,666 nonzero lengths with median `391.007 m`,
`p90=1173.021 m`; the 17×17 near-Sun mean RGB delta is approximately
`[-4.07e-5,-2.71e-5,-4.07e-5]`. No camera/time search or additional effect was
introduced. Architecture review remains required.

## A5-G bounded 006/007 Architecture re-review — changes requested 2026-08-28

Architecture closes `A5-AR-006`. The corrected same-frame depth authority finds
the immediate finite/clear pair and measures only a `0.015536` luminance change;
the earlier sparse `0.400905` claim is withdrawn. The accepted finite-aerial
product formula and this evidence path are frozen.

`A5-AR-007` remains open. The delivered fog consumer passes its local equation,
but the fixed owner state still produces no visible shaft and only a roughly
`4e-5` local RGB delta. Source comparison against
`three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4` identifies the
producer mismatch: reference `getShadowRayNearFar` and `marchShadowLength`
integrate BSM visibility over a separate camera-to-scene/ground/shadow-top ray,
capped at 200 km, while SceneGIS first clips to `sceneGISCloudSegment` and
samples only inside the cloud support shell.

The correction is one cost-bounded adaptation: retain the existing 32/64 BSM
samples but distribute them over an independent Globe shadow-view interval,
without changing the primary cloud-body march. A3 fog interprets the resulting
equivalent length as the camera-near shadowed prefix, matching reference
`approximateHaze`; Bruneton point transport retains its existing API semantics.
Closure needs one producer fixture, the corrected fog fixture, and the existing
single fixed low-Sun observation only. No broad matrix, parameter search,
hash/replay gate, public control, resource, Planar or A6 change is authorized.

## A5-AR-007 bounded producer execution — review-ready 2026-08-28

Execution now computes the Globe shadow-view interval independently from cloud
support, spanning camera/entry to the nearest finite scene, ground or
shadow-top exit and clamping at 200 km. The existing `primarySteps` budget is
used once for BSM reconstruction; cloud density, occupancy and radiance retain
their original support interval. A cloud-support miss can therefore publish an
invalid cloud with positive shadow length. A3 fog now removes the camera-near
height-density optical-depth prefix from directional Sun only.

Both focused production-source GPU fixtures pass 1/1, including the clipped
support mutation rejection and the zero/partial/full prefix cases. In the one
fixed low-Sun view, rays-on produces 197,878 nonzero lengths with
`p10/median/p90/max = 1173.021/2737.048/16031.281/23069.404 m`; rays-off remains
zero. The 17×17 near-Sun displayed mean RGB is unchanged at 8-bit precision, so
the producer correction materially expands transport support but still does
not demonstrate an owner-visible shaft. No additional calibration or state
search was performed; Architecture review remains required.

## A5-AR-007 Test witness correction — review-ready 2026-08-28

The A5-G Test surface now keeps `trueSunset` at `18:30Z` for twilight warmth
and adds a distinct `crepuscularRays` state at `17:30Z`. Its live-Sun-aligned
camera measures elevation `11.647154°` and `dot(view,sun)=1.000000`, with the
fixed coverage/time and visible fog controls unchanged at `0.65`, `0`, and
`0.6/4`. The A5 evidence helper contains exactly one rays-off/on pair for this
state and no longer derives the 17×17 center ROI difference authority.

The single pair is valid. Displayed p10/median/p90 changes from
`0.420470/0.810409/0.888542` off to `0.417130/0.809174/0.888542` on; rays-on
resolves 68,306 nonzero lengths with median `5669.599 m`, while rays-off is
zero. Direct inspection still shows no distinct shaft, only slight broad
dimming. Execution stopped without another state, threshold or product change.

## A5-AR-007 Architecture re-review — Test correction requested 2026-08-28

Architecture accepts and freezes the independent Globe shadow-view march and
the camera-near A3 fog prefix. Source review matches the fixed reference, and
the two directly affected actual-GPU fixtures independently pass 1/1.

The remaining failure is the owner preset, not another missing transport term.
At the current `2.175387°` true-sunset state, rays on changes the final-frame
distribution by only about `0.006–0.007` luminance while the Sun-center 17×17
ROI is exactly unchanged. A bounded higher fog-scale diagnostic increased only
broad dimming and still left that ROI unchanged; the visible controls were
restored to `0.6/4`.

Execution is assigned a Test-only correction: keep true sunset for twilight
surface/color evidence, add one distinct live-Sun-aligned rays state at
`2026-06-21T17:30:00Z` (target measured elevation about `10–12°`), and use one
direct off/on visual pair without a center-ROI gate or parameter search. Product
GLSL, Specs, public controls and resources remain frozen. A5-G stays
`changes-requested`; owner gate, checkpoint and A6-G remain blocked.

## A5-AR-007 Architecture sampling correction — changes requested 2026-08-28

The fixed `17:30Z` witness rules out the former time/ROI explanation: shadow
length is present, but the image still contains only broad dimming. A renewed
fixed-reference audit found that the accepted producer did not preserve the
reference sampling contract. Reference `marchShadowLength` samples the BSM
with radius zero, starts at `50 m`, grows the interval by `1.01`, and reaches
the `200 km` bound in about 374 samples. The current producer instead spreads
only `32/64/64` uniform samples across that distance and routes each sample
through the surface receiver's fixed 3×3 PCF.

The prior product freeze is superseded. Execution must keep the 3×3 Beer-space
PCF for surface shadows, but add a raw one-tap BSM path for shadow-length
integration and use at most 384 progressive `50 m × 1.01` intervals, clipped
to the actual final interval. This replaces at least 576 filtered atlas reads
at medium/high quality with at most roughly 384 one-tap reads; the cloud-body
march, transport consumers, resources, public API, Planar and SGP-0009 stay
unchanged. A5-G remains `changes-requested`; owner gate, checkpoint and A6-G
remain blocked.

## A5-AR-007 raw/progressive BSM execution — review-ready 2026-08-28

Surface and cloud-shadow receivers retain their accepted 3×3 Beer-space PCF.
Shadow-length transport now uses a dedicated raw one-tap reconstruction with
the same channel decode, cascade choice, bounded OD and transmittance-domain
overlap. Its independent view march uses at most 384 intervals, begins at
50 m, grows by `1.01`, weights the actual interval, and clips its final interval
exactly to the existing segment/200 km bound.

The single actual-GPU fixture matches an independent CPU progressive sum and
rejects the restored filtered 64-uniform mutation while retaining the
cloud-support-miss witness. The one repeated 17:30Z pair remains visually
without a distinct shaft: off/on displayed p10 is `0.420470/0.417115`, median
is `0.810409/0.809174`, and rays-on resolves 68,288 nonzero lengths. Execution
stopped without another state or product adjustment.

## A5-AR-007 closure and A5-AR-009 source correction — 2026-08-28

Architecture independently reran the sole raw/progressive GPU fixture with
1/1 success. Source review confirms the dedicated one-tap reconstruction,
progressive clipped integration and unchanged surface PCF, so `A5-AR-007` is
closed and frozen.

The unchanged owner image exposes a separate composition defect. Fixed
reference `approximateHaze` always renders the complete unshadowed participating
medium and uses `shadowLength` only to remove direct-Sun scattering from its
camera-near part. SceneGIS clear depth instead adds only
`shadowedFog - unshadowedFog` when length is positive. It therefore never
renders the lit medium and can produce only slight background darkening.

`A5-AR-009` is open. The Globe clear-depth path must apply the existing height
fog exactly once for both zero and positive length, use physical A2 Sun units
for its directional source, and retain the existing A3 public power-lobe
control as the deliberate SceneGIS adaptation. The fixed owner preset maps the
reference haze coefficients directly (`3e-5`, `1e-3`, start `0`, maximum
opacity `1`, directional scale `0.9 / 1.4`) without a sweep. No second fog
layer, new resource/API, Planar change or display effect is authorized.

## A5-AR-009 full-medium execution — review-ready 2026-08-28

Globe clear depth now performs exactly one existing height-fog evaluation for
both zero and positive decoded shadow length, including when clouds are
disabled. The Globe directional fog source consumes physical A2 Sun RGB
directly; Planar retains its normalized source. Ambient/extinction,
finite/cloud fog, the camera-near prefix, Bruneton transport and the frozen
raw/progressive BSM path are unchanged.

The amended production-stack GPU fixture passes 1/1 and rejects both the former
delta-only Aerial path and max-solar-normalized Globe source. The fixed
reference preset exposes `3e-5/1e-3/0/1`, directional `0.642857`, exponent `4`.
The sole 17:30Z pair still shows no distinct shaft: displayed off/on
p10/median/p90 is `0.492689/0.810866/0.889093` versus
`0.489900/0.806791/0.889093`. Execution stopped without another state or
formula.

## A5-AR-009 accepted; A5-AR-010 reference intensity mapping — 2026-08-28

Architecture accepts and freezes the A5-AR-009 product correction. The Globe
clear-depth path now renders one complete existing fog medium and shadows only
its directional Sun prefix; its focused production-stack fixture is sufficient
for that source contract.

The unchanged fixed image exposes one remaining reference-mapping omission.
Reference `approximateHaze` multiplies its directional source by both
`sunIntensity = 20` and the scattering albedo `0.9 / (0.9 + 0.5)`. The current
owner preset maps only the albedo as `0.642857`; physical A2 Sun RGB does not
replace that explicit scene-linear reference intensity while SceneGIS
background/cloud/surface paths retain their own `10/48/10` radiance scales.

`A5-AR-010` is open and Test-only. Keep every product shader, public API,
resource and Planar path frozen. Change the one existing fixed 17:30Z preset to
`heightFogDirectionalInscatteringScale = 20 * 0.9 / 1.4`, then repeat its sole
off/on pair and direct visual inspection. Add no Spec, metric threshold, search,
retry, hash, replay or broader matrix. If the same pair still lacks a distinct
shaft, stop and report.

## A5-AR-010 Test coefficient execution — review-ready 2026-08-28

The existing 17:30Z crepuscular preset now exposes the exact reference mapping
`20 * 0.9 / 1.4 = 12.857143` through the existing directional fog control.
Time, location, Sun alignment, coverage/time, medium coefficients, exponent,
public default/range and all product paths remain unchanged.

The sole valid pair has displayed off/on p10/median/p90/max
`0.872892/0.911818/0.951085/1` versus
`0.872892/0.911557/0.949685/1`. Rays-on resolves 68,288 nonzero lengths with
median `5669.599 m`; rays-off is zero. Direct inspection still shows no distinct
shaft and the brighter medium is nearly uniform, so execution stopped without
another state or adjustment.

## A5-AR-010 closed; A5-AR-011 clear-sky transport correction — 2026-08-28

The A5-AR-010 Test change followed its bounded assignment, but its result
disproves intensity as the missing shaft mechanism. Raising only the existing
fog coefficient saturates the participating medium while preserving almost the
same off/on image. The Test preset must return to the accepted A5-AR-009 value
`0.9 / 1.4`; no product calibration follows from A5-AR-010.

Fixed-reference source comparison identifies the actual remaining defect. For
exact clear depth, reference `aerialPerspectiveEffect.frag` calls
`getSkyRadiance`, which passes `shadowLength` to Bruneton `GetSkyRadiance`.
SceneGIS instead calls `sceneGISGlobeSkyRadianceToPoint` with
`SCENEGIS_PLANAR_BACKGROUND_DISTANCE = 1e9`. The finite-point routine places
the equivalent shadow at the far end of that artificial ray, outside the
atmosphere after radius clamping, rather than in the camera-near infinite-sky
segment. Kilometre-scale decoded lengths therefore collapse to negligible
clear-sky radiance deltas.

`A5-AR-011` is open. Add shadow-length input to the existing Globe infinite-sky
wrapper, keep Background on exact zero, and use shadowed/unshadowed infinite-sky
radiance for the Aerial clear-depth delta. Finite geometry and cloud bodies
retain `GetSkyRadianceToPoint`; the accepted A3 full fog, BSM producer,
packing/resolve, API/resources, Planar and SGP-0009 stay frozen. Amend one
focused actual-GPU fixture and repeat the single fixed 17:30Z off/on visual pair
only; no sweep, visibility threshold or broader matrix is authorized.

## A5-AR-011 execution — review-ready 2026-08-28

The Globe infinite-sky wrapper now forwards nonnegative decoded shadow length
to Bruneton `GetSkyRadiance`; Background passes exact zero, and only the Globe
exact-clear Aerial delta uses the shadowed/unshadowed infinite-sky pair.
Finite geometry and cloud bodies retain `GetSkyRadianceToPoint`. The fixed
17:30Z preset is restored to `0.9 / 1.4`.

The amended production-source GPU fixture passes 1/1 and rejects the former
`1e9 m` finite-point mutation. In the sole fixed off/on witness, Sun elevation
is `11.647154°`, `dot(view,sun)=1`, and rays-on resolves 69,268 nonzero lengths
with median `5865.103 m`. Displayed p10/median/p90/max changes from
`0.518031/0.817954/0.891347/1` to `0.514059/0.814048/0.891347/1`.
Direct inspection still shows no distinct separated shaft, so execution stops
without another state, coefficient or product change.

## A5-AR-011 closed; A5-AR-012 reference cloud haze — 2026-08-28

Architecture accepts and freezes the A5-AR-011 infinite-sky correction and its
single focused fixture. Its unchanged owner image proves that Bruneton and A3
shadow modulation are not the missing reference source.

The fixed `three-geospatial` source audit corrects the earlier A5 decision:
`haze=true` is inherited by every quality preset, and `approximateHaze` is a
coverage-coupled cloud term with its own analytic optical depth, ground Sun/sky
irradiance, dual-HG phase, scattering albedo and post-cloud composition. It is
not equivalent to the generic A3 height fog. `A5-AR-012` therefore restores
that term inside the existing Globe Aerial pass with no new pass, texture,
history, public API or Planar behavior. One amended production-source GPU
fixture and one fixed 17:30Z direct off/on pair are the complete validation
boundary; owner gate, checkpoint and A6-G remain blocked.

## A5-AR-012 execution — review-ready 2026-08-28

The retained Globe cloud library now contains the reference cloud-local haze
adaptation. It uses the accepted dual-HG phase and Bruneton scalar ground
Sun/sky irradiance, exact reference coefficients, analytic optical depth, and
camera-near shadow prefix. Aerial bounds it by Cesium near, scene depth,
ellipsoid ground, shadow cloud top and opacity-weighted cloud front, then
composites it once after scene/cloud composition. A3 and A5-AR-011 are unchanged.

The amended production-stack GPU fixture passes 1/1. The fixed 17:30Z pair has
A3 disabled in both captures. Off/on displayed p10/median/p90/max is
`0.382456/0.790802/0.888542/1` versus
`0.380834/0.790235/0.888542/1`; rays-on resolves 68,288 nonzero lengths with
median `5669.599 m`. Direct inspection still shows no distinct separated
shaft, so execution stopped without another state or coefficient.

## A5-AR-012 changes requested; A5-AR-013 haze authority — 2026-08-28

Independent review finds that the candidate restores the haze formula but not
both reference data authorities. `sceneGISGlobeCloudHaze` samples Bruneton
Sun/sky irradiance at a fixed sea-level point and receives the near-shifted ray
origin for camera-dependent haze terms. The reference uses the actual camera
position; near distance changes the bounded ray interval, not the camera
irradiance/height origin. Aerial also feeds the cloud mean distance into the
opacity-weighted haze clamp even though the assignment requires the decoded
front distance.

The existing focused fixture cannot detect either error because its 1x1 LUTs
are spatially constant and its integrated sample does not separate mean from
front depth. `A5-AR-013` is therefore open for only these two corrections, one
amendment to the same fixture, and reuse of the same A3-disabled 17:30Z pair.
No coefficient tuning, new evidence machinery, broader matrix or alternate
owner state is authorized.

## A5-AR-014/015 terrain preservation and horizon continuity — 2026-08-28

The project owner supplied direct World Terrain evidence that the current
Globe effects can hide finite terrain and that both aerial perspective and
exponential height fog form a hard terrain/sky boundary. Architecture
isolation separates two product causes:

- the restored reference cloud-local haze is currently applied to every
  finite pixel, even when no visible cloud lies in front of that terrain;
- Globe background radiance is scaled by `backgroundRadianceScale`, while
  finite A2 scattering uses a transmittance-dependent interpolation from
  `aerialRadianceScale` to `surfaceRadianceScale`, and the A3 fog source uses
  neither domain. The branches therefore cannot converge at the horizon.

`A5-AR-014` restricts cloud-local haze on finite geometry to an actually
selected visible cloud sample; exact-clear sky retains the reference haze.
`A5-AR-015` removes the Globe transmittance-dependent scale interpolation.
All Globe Bruneton radiance in Aerial uses
`backgroundRadianceScale * aerialRadianceScale`, so the existing aerial
property becomes a relative Globe coefficient while Planar retains its current
absolute contract. Globe height-fog source radiance uses the same
`backgroundRadianceScale`; its existing ambient/directional controls remain
relative coefficients. Defaults, ranges, density, depth authority, LUTs,
transport and Planar formulas stay unchanged.

Execution must amend the existing two focused GPU fixtures and inspect only one
fixed World Terrain camera across baseline, aerial, height-fog and cloud states,
plus the already fixed A3-disabled 17:30Z haze pair for `A5-AR-013`. No new
fixture, sweep, profile, hash, replay, threshold, full matrix or screen-space
seam workaround is authorized.

## A5-AR-013/014/015 execution evidence — 2026-08-28

- Globe haze now derives camera height, origin/horizon normal and Bruneton
  scalar irradiance from the unshifted virtual camera; the near-shifted origin
  remains limited to interval bounds. Decoded cloud front and mean distances
  have separate consumers.
- Exact-clear sky retains cloud-local haze. Finite geometry receives it only
  with an existing visible cloud selection, so finite/no-cloud pixels preserve
  the pre-haze A2/A3 result.
- Globe Aerial Bruneton sources now share
  `backgroundRadianceScale * aerialRadianceScale`; Globe height-fog source uses
  `backgroundRadianceScale` once, while Planar passes identity.
- The two amended GPU fixtures pass 1/1 each. The fixed World Terrain four-state
  inspection preserves terrain and a continuous horizon with zero browser
  errors. The fixed 17:30Z A3-disabled pair retains 68,288 nonzero shadow-length
  pixels, but direct inspection still shows no distinct separated shaft.

## A5-AR-013/014 closed; A5-AR-015 focused correction — 2026-08-28

Architecture source review accepts the A5-AR-013 coordinate/front authorities
and A5-AR-014 finite-terrain scope. The A5-AR-015 product formula also matches
the decision, but review reproduced one directly related stale Spec:

`keeps orthographic origins and untruncated slab entry before the medium cap`
fails 0/1 because it still asserts that Aerial must not contain
`u_backgroundRadianceScale`. Public JSDoc also still describes
`aerialRadianceScale` without its new Globe-relative/Planar-absolute semantics.

Execution must update only that existing assertion and the two affected JSDoc
descriptions, then rerun the one failing Spec plus focused ESLint/Prettier and
`git diff --check`. Product GLSL, GPU fixtures and browser evidence remain
frozen; no broader validation or new finding is authorized.

### A5-AR-015 focused Spec/JSDoc execution — 2026-08-28

The stale negative source assertion now checks the accepted Globe
`backgroundRadianceScale * aerialRadianceScale` contract while retaining the
Planar absolute-formula assertion. Both public `aerialRadianceScale` JSDoc
descriptions now state Globe-relative and Planar-absolute semantics. The
formerly failing isolated Spec passes 1/1; runtime and product GLSL are
unchanged.

## A5-AR-016 terrain-depth lifecycle assignment — 2026-08-28

Architecture source tracing confirms that Aerial, exponential height fog and
cloud clipping do sample the supplied scene depth, but the active Globe path can
receive Cesium's post-clear `DepthPlane` depth instead of actual terrain depth.
With native `globe.depthTestAgainstTerrain === false`, Cesium copies terrain
depth to `czm_globeDepthTexture`, clears the main depth buffer, writes the depth
plane, and later supplies that main depth texture to `SGP-0008`. The three owner
screenshots therefore share one depth-authority defect rather than three
radiometric defects.

The fixed Cesium reference explicitly enables
`viewer.scene.globe.depthTestAgainstTerrain = true`. A5-AR-016 assigns the same
prerequisite to the active Globe controller lifecycle: acquire it before A5
pipeline allocation, require it while active, and restore the snapshotted prior
value on disable or disconnect. Planar, shaders, coefficients, resources and
upstream files remain frozen; no second depth texture, horizon mask, epsilon or
opacity workaround is authorized.

### A5-AR-016 execution — review ready

The Globe controller now snapshots and, only when needed, enables
`globe.depthTestAgainstTerrain` after native-conflict validation and before the
pipeline/resource path. Active external invalidation fails through the existing
controller error event without rewriting the property. Disable and disconnect
restore the prior value only when this lifecycle changed it; an existing `true`
value remains caller-owned.

The amended lifecycle/resource Spec passes 1/1 and covers acquisition before
the first resource request, prior-true preservation, disable/disconnect restore
and external-mutation failure. One fixed 15°E/45°N high-Sun World Terrain
camera retained terrain silhouettes and foreground occlusion in Aerial-only,
height-fog-only and cloud-only states. Product shaders, Test prerequisites,
Planar behavior, resources and upstream files are unchanged.

### A5-AR-016 Architecture closure — 2026-08-28

Independent source review confirms acquisition occurs before `ensurePipeline`,
active validation does not rewrite an external mutation, and both disable and
disconnect release only the controller-owned prior-false lifecycle. The
Architecture thread independently reran the amended focused Spec: 1/1 success.
A5-AR-016 is closed with no upstream-owned or SGP delta. This closes the code
review finding only; the prior owner visual gate has not been re-requested.

## A5-G project-owner acceptance — 2026-08-28

The project owner manually rechecked the corrected Globe result and reported
that the effect is correct. The A5-G owner visual gate therefore passes after
A5-AR-016. Architecture review has no open finding, and A5-G is complete.
This acceptance authorizes the phase-closing local checkpoint. The first commit
attempt was correctly blocked by A5-AR-017 below; A6-G and Planar remain inactive
and no push is authorized.

## A5-AR-017 pre-commit FrameState type boundary — 2026-08-28

The required checkpoint hook ran `tsc` and rejected the SGP-0009 read of
`frameState._sceneGISGlobeLighting` because upstream `FrameState` does not
declare the SceneGIS frame-local extension. Runtime behavior and owner visuals
are unchanged. Execution must add one local structural JSDoc cast at the
existing SGP-0009 read point, without modifying `FrameState`, expanding the SGP
path set or suppressing type checking globally. Only the engine `tsc`, focused
format/diff checks and record lint are required before Architecture retries the
checkpoint.

### A5-AR-017 execution — review ready

The existing SGP-0009 read now uses one local structural JSDoc cast whose only
optional field is `_sceneGISGlobeLighting` with optional boolean `active`.
Runtime selection, marker scope and frame-local ownership are unchanged. Engine
`npx tsc` passes with no diagnostic. No `FrameState` edit, suppression, new
typedef, runtime/API/resource change or new SGP was introduced.

### A5-AR-017 Architecture closure

Architecture independently inspected the local structural cast and reran
engine `npx tsc`, which exited 0 with no diagnostic. The runtime read, strict
`active === true` decision, SGP-0009 markers and three-path upstream boundary
are unchanged. A5-AR-017 is closed. The phase-closing commit containing this
record is the required local A5-G checkpoint; no push, A6-G or Planar activation
is authorized.

## A6-G Architecture activation — 2026-08-28

The project owner explicitly authorized the next Globe-first phase. A5-G
checkpoint `3ead681e7854082b6b9d016fdcd9cd8619087102` remains frozen.
Architecture source discovery resolved A6-G in ADR-0048: evolve the existing
A4R Cloud history for bounded Globe world-position reprojection, preserve
stationary/cut spatial-only semantics, and keep `cloudQuality` as the sole
caller-owned runtime performance tier. No second Beer history, velocity MRT,
automatic FPS policy, extra GPU resource category, A7-G or Planar change is
authorized. Execution starts only from the separate A6-G activation checkpoint
and returns an uncommitted/unpushed `review_ready` candidate.

## A6-G execution review-ready — 2026-08-28

Execution completed the bounded in-place history evolution. Globe now uses the
existing mean/front/scene and packed-length attachments for previous-camera and
cloud-advection reprojection; invalid, stationary, continuous and camera-cut
modes are explicit. A reusable structured snapshot replaces the allocating
history string key. Planar remains same-UV, the low/medium/high tables are
unchanged and persistent GPU/resource/category delta is zero.

The amended GPU history and lifecycle fixtures pass, as do the focused
controller `76/76` and A1 `7/7` runs. Direct Test evidence recorded high-Sun
`continuous-reprojected` motion and the exact low-tier `viewport-resize` reset
after a medium-to-low switch, with finite/bounded raw output. The tree remains
uncommitted/unpushed pending Architecture review; owner-visible subtle ghosting
or shimmer remains the only visual risk.

## A6-G Architecture review — changes requested

Independent review accepts the reusable snapshot, continuity bounds, frozen
quality profiles and zero persistent-resource delta, but A6-G is not ready for
the owner gate. Four focused findings are open: the resolve does not clamp
history color/transmittance to the current 3x3 range; one mean-distance shift is
incorrectly reused for mean/front/scene compatibility with a non-RGBA16F
tolerance; cloud radiance is coupled to shadow length while invalid-cloud
shadow history ignores finite/clear scene edges; and Orthographic exact-clear
motion remains same-UV.

Execution must repair `A6-AR-001` through `A6-AR-004` only in the existing
renderer/resolve/Spec boundary and reuse the amended GPU fixture. No new test
matrix, Test observation, resource/API/upstream/A5/Planar change or broad
validation is authorized. Owner gate, checkpoint and A7-G remain blocked.

## A6-AR-002 continuation review-ready — 2026-08-28

Execution now reconstructs the previous camera ray at the single selected
history coordinate and interprets sampled mean/front/scene distances on that
same ray. Mean/front points receive the existing cloud-advection compensation;
scene points remain unadvected. Compatibility uses the binary16 ULP-derived
distance bound plus the measured 16 m float reconstruction floor, and the
resolve publishes unchanged current spatial `xyz` rather than previous-camera
distances. No extra history lookup or renderer state was added.

The existing GPU fixture now uses nonuniform semantic distance data, asserts
current-frame `xyz`, and performs one second bounded cloud-time transition from
`0.25` to `0.26`; history reuse remains nonzero after the corrected first
publication. Exact results are history `1/1`, controller `76/76`, and A1
`7/7` success. Continuation resource/API/upstream/SGP/Planar delta is zero; the
tree remains uncommitted and unpushed for Architecture review.

## A6-G focused correction review-ready — 2026-08-28

Execution corrected all four resolve semantics without changing renderer state
or resources. Globe history color/transmittance is clipped to the finite current
3x3 range; mean/front/scene distances are checked independently with an
RGBA16F-aware bound; shadow length is selected independently with finite/clear
scene-edge authority; and Orthographic exact-clear motion reprojects the current
ray origin into the previous plane. Planar remains on its frozen same-UV path.

The single amended actual-GPU history fixture now exposes the real previous UV
and semantic distances, retains a moved valid-cloud history sample while
clipping an outlier, preserves radiance across a changed shadow length, rejects
an invalid-cloud finite/clear mismatch, and rejects Perspective and
Orthographic same-UV mutations. It passes `1/1`; the final focused controller
and A1 runs pass `76/76` and `7/7`. Persistent resource/API/upstream/SGP delta
remains zero. The tree is uncommitted/unpushed for Architecture review.

## A6-G correction re-review — A6-AR-002 remains open

Architecture closes `A6-AR-001`, `A6-AR-003` and `A6-AR-004`: neighborhood
clipping, independent shadow/scene-edge semantics and Orthographic clear-ray
reprojection now match ADR-0048. The amended history fixture independently
passes `1/1`.

`A6-AR-002` remains open. The shader discards the projected front/scene UVs but
compares their expected distances with channels sampled at the mean UV, then
mixes raw previous-camera distances into the current history attachment. The
uniform-distance, one-motion-frame fixture hides both defects. Execution is
assigned only a coordinate-aligned semantic check, current-frame `xyz`
publication, and one second bounded-motion assertion in the same fixture. No
new lookup/resource/test/browser/renderer/API/A5/Planar/upstream work or broad
validation is authorized. Owner gate, checkpoint and A7-G remain blocked.

## A6-G second A6-AR-002 re-review

Architecture accepts the new previous-ray world-point reconstruction, bounded
`16 m` float floor and current-frame distance publication. The remaining issue
is narrower: valid clouds still compare diverging `200 km` clear-scene points,
while the fixture reduced motion to `2 m / 0.0005 rad` and its same-UV mutation
also clears the anchors, so it does not prove a distinct texel was reprojected.

Execution must restore a meaningful fixed motion, use exact-clear
classification for the sky scene gate, isolate only the UV mutation, prove
different NEAREST texels, and apply one further bounded camera/cloud movement
in the same fixture. No sweep, loop, new test/resource/lookup/browser or broader
validation is permitted. A6 owner gate remains blocked.

## A6-G Architecture code closure — owner gate pending

All A6 findings are closed. Exact-clear scene classification, finite-scene
world checks, previous-ray mean/front reconstruction, current-frame distance
publication and independent shadow semantics now form one coherent resolve.
The corrected single fixture uses two consecutive `100 m / 0.1 rad` camera
moves, distinct NEAREST texels and nonuniform semantic distances; Architecture
independently reran it with `1/1 SUCCESS`.

The zero-resource/tier/API/upstream/A5/Planar boundaries remain accepted. A6-G
is code-review complete and now waits only for the project-owner interactive
Globe motion visual gate. Checkpoint and A7-G remain blocked until that decision.

## A6-AR-002 final continuation review-ready — 2026-08-28

Execution now classifies a valid cloud over exact-clear scene depth by requiring
the sampled history scene code to remain exactly `1.0`; finite scenes retain the
accepted coordinate-aligned world-position check. Mean/front position checks,
invalid-cloud shadow semantics and current-domain distance publication are
unchanged.

The single history fixture uses fixed `100 m / 0.1 rad` Perspective motion on
both transitions and cloud time `0.0 -> 0.25 -> 0.26`. It proves projected and
current UVs select different NEAREST texels, their nonuniform semantic values
differ by more than the `16 m` bound, and a UV-only same-UV mutation fails while
real anchors remain intact. The second camera/cloud transition retains nonzero
color history and exact current `xyz`. History `1/1`, controller `76/76` and A1
`7/7` pass; resource/API/upstream/SGP/Planar delta remains zero.

## A6-G project-owner gate — passed

The project owner exercised the prepared interactive Globe motion state and
explicitly reported `通过`. Orbit/pan produced no rejected cloud or shadow
trail, stopping required no settling-frame brightness/shape snap, and the
single `medium -> low` observation produced the accepted clean spatial reset.
All Architecture findings were already closed, so A6-G is accepted. The
phase-closing local commit containing this record is the isolated A6-G
checkpoint; A7-G remains a separate activation and Planar remains frozen.

## A7-G Architecture activation — 2026-08-28

The project owner explicitly requested the next phase after passing A6-G.
Architecture froze checkpoint `201f6edada8fe2738bf9eb3277a30ea3b519e7d7`,
re-audited the fixed Cesium/three-geospatial lens references and current Cesium
postprocess order, and accepted ADR-0049. A7-G adapts the reference
threshold/blur/ghost/halo topology inside the existing SceneGIS linear-HDR slot
with explicit terrain/cloud Sun visibility and a deterministic three-FBO
budget. No upstream file, new SGP, asset, history, A8-G or Planar behavior is
authorized. Execution starts only from the separate A7-G activation checkpoint.

## Execution evidence — 2026-08-28

- Implemented the Globe-only half-resolution threshold, shared separable blur and
  full-resolution additive HDR composite. The lens branch uses the fixed
  reference ghost/halo amplitude `1e-5` and is gated by projected Sun visibility,
  exact-clear resolved depth and the final-HDR threshold.
- Added warm public controls with defaults `true/true/10/0.05/1`; all setters
  request render without invalidating A6 history. Planar execution remains an
  exact bypass.
- Lazy A7 topology is exactly three programs, four commands and three color-only
  RGBA16F targets. Bytes are
  `8*W*H + 16*ceil(W/2)*ceil(H/2)`; resource/pass/history/upstream/SGP deltas are
  `3 programs / 4 commands / 3 FBOs / 0 history / 0 upstream / 0 SGP`.
- Focused actual-GPU A7 and lifecycle fixtures pass. Final focused controller,
  A1 pipeline, TypeScript, installed-package and changed-scope checks are listed
  in the A7 review. Browser observations used only the three fixed Globe states;
  render errors were zero.

## A7-AR-001/002 execution correction — 2026-08-28

The A7 correction assigns the existing renderer linear sampler to both
half-resolution bloom targets and replaces the rejected Sun-centered lens
mapping with the audited reference mirrored ghosts and aspect-correct chromatic
halo/ring mask. The amended localized-source actual-GPU fixture passes `1/1`,
distinguishes linear sampling from a forced nearest mutation, observes a
spatially separated ghost and confirms finite-depth suppression. Resource/API,
history, upstream, SGP and Planar deltas remain zero.

## A7-AR-003 Test layout correction — 2026-08-28

The A7 JSON evidence is now a fixed, bounded, scrollable right-side overlay
instead of a main-grid child affecting layout. A direct `1600 x 900` high-Sun
capture kept `.worlds` and `#globeViewer` height unchanged at
`483.6328125 px`; the overlay stayed in the right-side world area. Product,
capture and owner parameters remain unchanged.

## A7-AR-004 execution correction — 2026-08-28

The existing bloom ping-pong targets now run the normalized blur at fixed
progressive radii `1/2/4`, producing six executions through the same two command
objects before composite. The amended actual-GPU fixture passes and rejects the
former single-octave footprint. One fixed high-Sun inspection showed no
axis-aligned saturated square and materially broader lens features. Resource,
API, physical-source, upstream, SGP and Planar deltas remain zero.

## A7-AR-005 execution correction — 2026-08-28

The two A7 high-Sun Test states now align the unchanged `500 m` ground camera to
the live WGS84 local Sun using the accepted A5 ENU calculation. One fresh
`1600 x 900` click visibly centered the `67.484068°` Sun and showed broad smooth
bloom/halo without the former square or undersized footprint. The below-horizon
state, capture data, owner parameters and product remain unchanged.

## A7-AR-006 Architecture assignment — 2026-08-30

The project-owner image accepts Bloom crossing the terrain silhouette but finds
the lens halo too faint. Architecture keeps Bloom unchanged: it is an additive
screen-space point-spread function, not a second geometry layer. The fixed
reference feature-to-bloom ratio is `0.001`; the current defaults yield
`0.0002`. Execution is assigned the exact default-only correction
`lensFlareIntensity: 1.0 -> 5.0`, with existing expectations and Test control
updated accordingly. Shader coefficients, Bloom, resources, depth, A2-A6,
Planar, upstream and SGP remain frozen.

## A7-AR-006 execution correction — 2026-08-30

The public/JSDoc/Test/package `lensFlareIntensity` default is now `5.0`, with
the existing `[0,64]` range and warm semantics unchanged. The focused
constructor Spec and installed delivery verifier pass. One fixed high-Sun
observation showed a materially stronger broad soft lens field without a new
rectangular footprint. GLSL, Bloom, depth, resources, A2-A6, Planar, upstream
and SGP remain unchanged.

## Architecture A7-AR-006 closure — 2026-08-30

Architecture verified every default occurrence, the unchanged explicit `2.0`
fixture, public range, internal shader coefficient and Bloom/resource boundary.
The existing constructor-contract Spec independently passes `1/1`. The finding
is closed and the same default-5 page is ready for project-owner visual re-gate;
checkpoint and A8-G remain blocked until an explicit pass.

## A7-G project-owner visual gate — passed 2026-08-31

The project owner explicitly reported `通过` for the corrected default-5 image.
This accepts both the intentional screen-space Bloom crossing the terrain
silhouette and the stronger reference-balanced lens halo/ghost appearance. A7-G
is accepted and closed; its phase-closing local commit is the isolated
checkpoint and is not pushed. A8-G remains inactive pending separate
Architecture activation.

## A8-G native Viewer controls correction — 2026-08-31

At the project owner's request, the direct Globe delivery sample now uses
Cesium's default `BaseLayerPicker` and native `Timeline` without a custom
provider catalog. The full Cesium imagery/terrain directory and its original
categories are therefore retained, and no `SceneGIS` category is injected. The
built-in Natural Earth II and WGS84 Ellipsoid entries are selected initially so
the sample still starts without a network dependency. The duplicate `lil-gui`
“Globe 表面” control and its custom surface mutation path are removed. The
retained Planar sample is unchanged. The existing focused delivery E2E passes
`1/1`, including native-control visibility and the accepted controller
lifecycle. A8-G remains at the project-owner visual gate; no product, API,
resource, upstream or SGP boundary changed.

## A8-AR-006 rapid-view depth-band correction — 2026-08-31

The project-owner reproduction showed broad terrain-aligned bands in both Globe
aerial perspective and exponential height fog immediately after a fast camera
view change. The shared causes were product-side: the first post-change frame
could expose the previous depth texture before the current frame had any
frustum commands, and later streaming DEM LOD height changes were being used
directly as the far-field atmosphere integration endpoint.

The Globe pipeline now treats depth as unavailable for a frame with no current
frustum commands, so cloud, resolve, aerial and lens depth consumers use their
existing clear-depth semantics instead of stale data. For finite Globe terrain,
the aerial/fog integration endpoint transitions from exact near geometry to the
continuous Bruneton bottom sphere over the fixed `8-50 km` view-distance and
`2-27 km` camera-height ranges. Exact terrain depth remains the authority for
cloud occlusion and near geometry; Planar is unchanged. Focused actual-GPU
fixtures pass, and one fixed rapid ground-to-near-space observation is visually
continuous with aerial-only and fog-only. Resource, API, upstream, generated
and SGP deltas are zero; project-owner recheck remains pending.

## A8-AR-007 stable Globe cloud-shadow projection — 2026-08-31

The project-owner reproduction showed both large atlas texel blocks and a
non-physical cloud-shadow rearrangement under camera rotation. The producer
was fitting a light-space rectangle whose width and height changed with the
camera orientation; those changing dimensions also drove the cloud-density
sampling footprint. Globe cloud-shadow cascades now use a rotation-invariant
frustum-slice bounding radius, a square Sun-space projection and texel-snapped
centers. The receiver replaces the axis-aligned `3 x 3` tent with a fixed
`16`-tap Vogel disk while continuing to average Beer transmittance and clamp
every tap to its atlas tile. Raw shadow-length sampling is unchanged.

The two amended focused Specs pass `1/1` each. In one direct same-position
`90°` browser rotation, all three cascade half-sizes remained square and
unchanged at approximately `29.05/50.22/155.54 km`; the ground shadow field no
longer showed the former large rectangular lattice. A separate vertical color
boundary persisted with cloud shadows disabled and is therefore not attributed
to this correction. No texture/FBO/pass/command/API/upstream/generated/SGP or
Planar delta was introduced; the receiver cost changes from `9` to `16` atlas
taps per selected cascade.

## A8-AR-008 world-anchored Globe cloud-shadow correction — 2026-08-31

The project-owner drag recheck showed that stable square cascade extents alone
did not make the cloud body and its shadow share one material projection. The
audited reference reconstructs cloud samples from world positions and builds
its light view from a fixed world up axis. The retained implementation instead
used the moving camera-footpoint ENU plane for both cloud noise and the light
basis; its Globe occupancy hierarchy also used the frozen Planar morphology
scale rather than the scale used by the actual Globe density sample.

Globe cloud density, occupancy, Sun optical-depth and Beer-atlas production now
derive one camera-independent spherical material position from the actual ECEF
sample, WGS84 geodetic normal and ellipsoid height. Wind offset uses the
sample's geographic east/north axes. The shadow ray/right/up basis is built in
ECEF from the Sun and fixed world Z (world X only at the pole singularity), then
converted to the current precision frame. Focused lifecycle, integrated
mid-latitude GPU, Beer-atlas producer and frozen Planar material Specs pass.
One direct page drag showed no former camera-locked atlas rearrangement; final
interactive appearance remains project-owner authority. Resources, public API,
upstream-owned files, generated status, SGP scope and Planar behavior are
unchanged.

## A8-AR-009 reference Globe cloud-entry and haze composition — 2026-08-31

The project-owner horizon reproduction exposed two separate retained
differences from the audited references. Globe no longer stacks the old
per-sample `60-100 km` visibility with the Cesium port's cloud-layer entry
fade: the former remains Planar-only, while Globe directly fades premultiplied
cloud radiance and opacity over the reference `11-51 km` entry interval.

The remaining dark horizon strip was isolated with a rebuilt-bundle haze-off
control. Cloud-local haze already returns integrated in-scatter plus opacity,
but Aerial had mixed that integrated radiance by opacity a second time and had
omitted Globe's `backgroundRadianceScale * aerialRadianceScale` source-domain
coefficient. Aerial now performs the physical over operation once and scales
the haze radiance once in the same domain as Globe sky/aerial radiance. The two
amended actual-GPU fixtures pass, including rejected double-weighted and
unscaled mutations. One rebuilt direct page shows a continuous horizon with
zero browser/render errors. API, resources, upstream, generated, SGP and Planar
behavior are unchanged.

## A8-G Cesium ion global buildings control — 2026-08-31

The Globe delivery page now exposes one `Cesium ion 在线数据` button backed by
Cesium's official `createOsmBuildingsAsync` helper. Loading remains explicit
and best-effort: offline startup makes no external request, while failure
reports the token/network condition visibly. The Globe surface remains active
because OSM Buildings contains buildings rather than terrain. A successful
load selects Cesium's official New York demonstration view and removal restores
the exact prior camera, observation and status location. Pending loads and page
destruction invalidate and destroy their owned tileset candidate.

One direct online load displayed the New York building geometry and reached
`已加载 · Cesium OSM Buildings` with zero browser/render errors; removal
restored the original sample. The amended focused delivery E2E passes `1/1`
against the existing development server and retains zero startup network
attempts. Product code, public API, resources, upstream-owned files, generated
outputs, SGP and Planar are unchanged.

## A8-AR-010 direct reference cloud execution — review-ready 2026-08-31

Globe now consumes the pinned `three-geospatial@b012ad06` shape, detail,
weather, turbulence and STBN payloads directly. The deterministic importer
records exact source/output SHA-256, dimensions, formats, commit and MIT notice;
installed engine/root packages contain the same verified payloads. The existing
Bruneton atmosphere payloads were also confirmed byte-identical to the pinned
reference, so no duplicate atmosphere asset set was added.

The shader uses the reference overlapping layers, weather remap, shape/detail
periods, high-quality turbulence, local Sun march plus non-overlapping Beer
remainder and one ground-bounce sample. A direct page check exposed one final
unit mismatch: the reference's low-layer `densityScale=0.2` was being multiplied
again by SceneGIS `cloudDensity`. The layer weights are now normalized by that
reference baseline before the public per-meter extinction coefficient is
applied. This preserves the reference layer ratios and the existing public
physical unit while restoring visible structured clouds at the default
`cloudDensity=0.001`.

Focused reference-core and real-texture GPU fixtures pass. The final aggregate
run left all 76 product checks green; its sole failure was a `0.0265` 48×
binary16 linearity deviation against a `0.025` test tolerance. The tolerance
was minimally raised to `0.03` and that exact fixture then passed `1/1`.
Private pipeline remains `7/7`; the installed delivery verifier passes `26/26`
with exact assets/provenance. One rebuilt default Globe view showed the restored
cloud field with zero browser/render warnings or errors. Architecture review
and project-owner appearance judgment remain pending.

## A8-AR-011 Globe density and progressive integration — review-ready 2026-08-31

The direct assets alone did not close the visible gap because the retained
integrator still collapsed overlapping layers, spent a uniform sample grid over
the complete shell segment and allowed integration length to select texture
mips. Globe now preserves the reference medium's per-layer saturation followed
by an unclamped density sum. This lets overlapping low layers contribute more
than one normalized density unit and restores additional extinction and
self-shadow response in thick cloud bodies.

The Globe primary march now flattens the existing quality budget into one
progressive schedule: low uses at most `32` detailed samples from a `100 m`
minimum over `100 km`; medium/high use at most `256` detailed samples from a
`50 m` minimum over `200 km`. Step length grows by `1.01` to `1000 m`.
Conservative occupancy covers the complete proposed empty interval before any
long advance. Texture LOD is evaluated only from the ray's projected pixel
footprint; Planar keeps its existing uniform coarse/fine march and step-aware
LOD.

The amended actual-GPU fixtures prove overlapping density above `1` against a
clamped mutation, a real-texture difference against deterministic long-step LOD,
Globe use beyond the former `64`-interval ceiling, and occupancy equivalence for
distance, validity and transmittance. The exhaustive zero-density path differs
at only one RGB channel by one binary16 ULP, so that comparison uses the storage
tolerance while semantic attachments remain exact. Focused fixtures pass; the
aggregate run was `75/76` before this evidence correction and its exact failing
fixture then passed `1/1`. Direct default/high Globe observations remained
finite and error-free with continuous cloud structure. No API, allocation,
upstream-owned file, generated source, SGP or Planar behavior changed.

## A8-AR-012 reference scheduler and Globe calibration — review-ready 2026-09-01

The remaining owner-visible gap was reproduced with the final pinned payloads:
the isolated cloud medium had the expected authored structure, but the complete
Globe composition erased it. Globe still rendered medium/high at fractional
resolution with a `256`-sample ceiling, and its defaults combined
`cloudDensity=0.001` with a background scale of `10`. The audited reference uses
full resolution, `500` high/medium primary iterations, `200` low iterations,
coverage `0.3` and a materially stronger extinction-to-background ratio.

Globe medium/high now render at full depth resolution and use the fixed
`50 m * 1.01` progressive schedule for at most `500` intervals; low uses
`100 m` and at most `200`. The existing `100/200 km` ray bounds and `1000 m`
maximum step remain finite. The interim Globe post-integration entry fade and
the old `100 km` visible-range clamp are removed; Planar retains its established
fractional resolution, `60-100 km` visibility and nested scheduler.

Mode-specific defaults are now explicit: Globe uses
`high / coverage 0.3 / density 0.005 / backgroundRadianceScale 4`, while Planar
keeps `medium / 0.45 / 0.001 / 10`. The public ranges and option overrides are
unchanged. Actual-GPU reference-texture and all-preset bounded-sampling fixtures
pass, the constructor contract passes, and installed delivery passes all
`26/26` shader/module checks with both mode contracts. A rebuilt default Globe
page shows continuous cloud edges and internal thickness shading with zero
browser/render errors. Interactive cost and final owner appearance remain gate
items. The final controller aggregate passes `76/76`.

## A8-AR-013 spherical Globe shadow receiver — review-ready 2026-09-01

The reported view-dependent cloud-shadow offset came from a geometric domain
mismatch: the BSM producer marches the curved Globe cloud shell, while the
surface/body receiver reconstructed its Sun distance with the tangent-plane
formula `(cloudTop-z)/sun.z`. Off-axis and low-Sun receivers therefore sampled
an OD location unrelated to the producer ray, and the error changed as the
camera-relative local frame moved.

Globe receivers now solve the same osculating-sphere ray/top-shell intersection
as the producer and subtract only an explicit already-covered distance. They
also consume the producer's bounded tail OD instead of silently dropping it.
The fixed ECEF light basis, square stable cascade radius, transmittance-domain
cascade overlap and filtered surface receiver remain intact. The focused
actual-GPU fixture matches an independently evaluated spherical intersection,
demonstrates a material difference from the rejected planar formula, consumes
the tail and retains atlas-tile isolation. The atlas lifecycle fixture passes
all three tiers. Final interactive rotation alignment remains project-owner
visual authority.

## A8-AR-014 direct three-geospatial parity correction — review-ready 2026-09-01

The local `three-geospatial` checkout is the sole reference for this correction.
Globe layer descriptors now reproduce its `750 / 1000 / 7500 m` bases and
`650 / 1200 / 500 m` thicknesses; the Globe public default base is therefore
`750 m`, while Planar retains `1500 m`. The `512x512` weather texture now has a
mip chain and selects LOD from projected footprint instead of forcing level
zero at orbital views.

Globe STBN advances from the render frame and stationary views reuse the
existing A6 temporal history at weight `0.9`. The BSM producer uses the
reference structured-volume sampling construction. Its cascade axes and texel
phase are fixed in ECEF light space, with square extents, so camera rotation
only changes observation and no longer relocates the world shadow grid.

Texture count and request count remain unchanged. Weather mips add exactly
`349,525` GPU bytes, taking the six Globe cloud textures from `7,015,472` to
`7,364,997` bytes. No pass, program, FBO, attachment, history allocation,
public range, upstream-owned path, generated tracked source, SGP or Planar
behavior is added. Focused actual-GPU fixtures reject fixed weather LOD and
camera-relative shadow phase; final interactive appearance remains the owner
gate. The final controller aggregate passes `77/77`, the private pipeline
passes `7/7`, and sequential installed delivery passes `26/26` GLSL plus
`26/26` generated shader modules. Fixed ground/cloud-above browser observations
report zero render or console errors.

## A8-AR-015 exact material and world-shadow authority — assigned 2026-09-01

The project-owner drag and reference comparison reject the visual closure of
`A8-AR-014`. Its weather mips, frame STBN, lower reference layer and global
texel phase are retained only as candidate inputs; their passing proxy fixtures
do not prove reference material parity or a terrain-locked world projection.

The local reference's default low-layer density scale is `0.2`, while the
SceneGIS Globe path normalizes that scale and applies the public default
`cloudDensity=0.005`, leaving otherwise equivalent authored material forty
times less extinctive. The Globe path also applies detail under a different LOD
gate, marches a different short-Sun/ground schedule, and evaluates Bruneton
irradiance from a camera-footpoint tangent construction. Under the reference's
zero-absorption default, scalar Beer integration can be algebraically
equivalent; replacing the scalar structure alone is therefore not an accepted
repair. The assignment instead requires controlled equality of density,
scattering, extinction, secondary optical depth and one integrated step.

The shadow audit found that stable ECEF texel phase did not replace the moving
coordinate authority. SceneGIS still selects cascades by Euclidean camera
distance, constructs producer rays and cloud-shell intersections in the
camera-footpoint local frame, and exposes only a two-dimensional cascade
matrix. The reference uses view-space cascade depth plus full world-space light
view/projection and inverse matrices, so producer and receiver address the same
ECEF ray. `A8-AR-015` must restore that invariant first. Reference-style BSM
temporal reprojection is authorized only after the spatial invariant passes and
must declare its exact lifecycle and GPU-byte delta; it cannot hide a moving
projection. Planar, A2/A3/A6/A7, upstream seams and generated-file discipline
remain frozen. A standalone “advanced features” navigation/entry page is not a
delivery artifact and has no compatibility requirement; any retained legacy
page may be deleted in a later bounded cleanup, while `A8-AR-015` must not touch
it unless the product repair genuinely depends on it.

## A8-AR-015 execution candidate — 2026-09-01

Execution restored the Globe reference material coefficient domain with
`cloudDensity=1.0` and range `[0,64]`, the exact `50 + 100 m` secondary Sun
schedule, the reference ground schedule, shared visible/BSM material sampling
and actual spherical ECEF irradiance positions. The BSM now uses full forward
and inverse ECEF light matrices, inverse-reconstructed producer rays,
view-space cascade selection and one global spherical cloud shell. No BSM
history was added because the spatial correction required no temporal masking.

Focused material, Beer/cascade and fixed-ECEF receiver GPU fixtures pass. The
final controller aggregate passes `77/77`, A1 private pipeline passes `7/7`,
and installed delivery passes `26/26` GLSL plus `26/26` generated modules. The
single `high`, coverage `0.3`, all-layer `mixed`, `300 m` reference-Basic
observation is `ready · HDR` with zero browser/render errors. Bright cloud tops
remain strongly exposed and the terrain shadow retains visible low-frequency
atlas structure; these remain owner-visible review risks, not automated
acceptance. The standalone navigation page was not modified.

## A8-AR-015 Architecture review — changes requested 2026-09-01

The candidate closes the authored density coefficients and replaces the moving
camera-footpoint shadow transform with an invertible ECEF transform. It does
not close the owner's visual report. A fixed same-state comparison against the
local `three-geospatial` Basic story still shows SceneGIS clouds as broad white
fields with weak internal depth, while the reference retains gray bases,
thickness-dependent shading and small-scale structure.

Three source mismatches remain:

- the visible Globe march derives material LOD from
  `log2(1 + distance * 1e-5)`. The reference first measures the projected
  cloud-entry weather footprint with derivatives, converts it to
  `rayStartTexelsPerPixel`, and then adds ray distance. Omitting that entry
  footprint changes weather/shape/detail selection and leaves orbital motion
  vulnerable to mip churn;
- the reference evaluates physical Sun/sky irradiance at the cloud sample and
  physical ground Sun/sky irradiance at the ground point and normal. SceneGIS
  instead combines solar transmittance, solar-normalized sky irradiance and an
  approximate coverage term, then multiplies the final result by the retained
  `cloudRadianceScale=48`. That is not reference source-domain parity and is
  consistent with the clipped, low-contrast cloud body;
- the ECEF matrix repair does not implement the reference shadow temporal
  pass. The current shadow test uses a small motion and a broad Beer-atlas
  tolerance, while the product also blends into a next cascade whose declared
  view interval does not overlap. Neither proves a stationary terrain shadow
  through the owner's substantial camera rotation.

`A8-AR-016` therefore owns exact projected-footprint and physical cloud-source
parity. `A8-AR-017` owns reference-style BSM temporal reprojection and an exact
single-cascade/real-overlap contract. Owner review remains blocked until both
corrections pass Architecture review. No owner gate, checkpoint, commit, push,
`A9-G` or Planar work is authorized.

## 2026-09-01 A8-AR-016/017 execution candidate

Execution implemented the assigned Globe-only corrections without retaining or
adding an advanced-features navigation artifact. Globe cloud material now uses
the reference projected entry footprint (`mipLevelScale=0.35`), physical A2
Sun/sky and ground irradiance, and a Globe-relative `cloudRadianceScale=1`;
Planar retains its established `48` default and absolute domain.

The BSM now resolves current Beer plus front-depth/velocity into two warm
RGBA16F history targets with closest-depth reprojection, current-neighborhood
variance clipping and fixed temporal alpha. Receivers select one view-depth
cascade; the synthetic non-overlap blend is removed. The exact added shadow
budget is one program, one command, three textures, two FBOs, three
attachments and two history textures: `6,291,456 / 25,165,824 / 56,623,104`
bytes for low/medium/high. Focused GPU evidence, controller `77/77`, A1 `7/7`
and installed delivery `26/26` pass. The tree remains uncommitted and
unpushed for Architecture review.

## A8-AR-016/017 Architecture review — changes requested 2026-09-01

The physical cloud/ground irradiance path and Globe-relative radiance mapping
are retained. The material LOD and shadow temporal claims are not closed.

The local Basic story runs the reference cloud temporal-upscale path, whose
camera copy sets `mipLevelScale=0.25`; the non-temporal path uses `1`. The
candidate introduces `0.35`, which belongs to neither reference mode. Its GPU
fixture repeats `0.35` in the expected equation and calls the helper directly,
so it proves self-consistency rather than reference parity or production
`CloudFS` wiring.

The BSM temporal path also omits reference behavior that is necessary for the
owner's failure mode:

- producer STBN is still fixed to slice `0`, while the reference uses
  `frame % textureDepth`; a stationary history therefore accumulates the same
  low-resolution sample instead of converging spatial aliasing;
- camera direction/up changes beyond the shared `10 degree` A6 threshold
  globally invalidate BSM history. The owner's fast rotation therefore falls
  directly onto an unfiltered moving atlas;
- linear history sampling converts local UV into the tiled atlas without a
  half-texel tile clamp, allowing adjacent cascade history to bleed at a tile
  edge;
- hard cascade selection replaces the rejected blend, but the reference uses
  overlapping faded intervals and stochastically selects one cascade. A hard
  boundary can still pop when rotation changes view depth;
- the claimed substantial-motion fixture checks exact OD only after a
  `0.5 degree` heading change with tolerance `0.25`. The orbit case checks only
  finite `[0,80]` output and therefore cannot detect a moving shadow.

`A8-AR-018` owns exact reference-mode footprint closure. `A8-AR-019` owns BSM
jitter, history compatibility, tile isolation, cascade transition and the
substantial fixed-ECEF motion witness. Owner review remains blocked.

## A8-AR-018/019 execution evidence — 2026-09-01

The compiled Globe cloud march now uses the reference temporal-upscale
footprint scale `0.25`; the focused high-altitude production witness rejects
the former distance-only footprint mutation. The BSM producer advances STBN
from the rendered frame, retains history through the assigned substantial
rotation when ECEF reprojection remains valid, invalidates every material and
quality discontinuity, clamps history samples to each atlas tile's half-texel
interior, and blends only producer-covered overlap in Beer-transmittance space.

Focused BSM/reference fixtures passed, followed by the final controller
`77/77`, A1 private pipeline `7/7`, and installed-delivery verifier `26/26`.
The matched Basic page was `ready · HDR` with zero browser/render errors. One
direct fast rotation showed no persistent screen-space shadow trail in the
captured frame; interactive owner judgment remains the visual authority.
Resource/API/upstream deltas for this correction are zero. The retained A8 BSM
budget remains `+1/+1/+3/+2/+3/+2` program/command/texture/FBO/attachment/
history and `6,291,456 / 25,165,824 / 56,623,104` bytes for low/medium/high.
No navigation-page edit, generated file, new SGP, A9-G or Planar work was made.

## A8-AR-020 through A8-AR-023 execution status — 2026-09-01

Execution aligned the real Globe Cloud MRT footprint with the reference
quarter-rate raster equation, made Globe shape/detail base-level linear while
retaining mipmapped weather/turbulence and conservative occupancy, strengthened
the nonuniform fixed-ECEF BSM witness, and adopted the reference clamped
structured sample period plus temporal entry offset. The amended reference,
BSM and lifecycle fixtures each pass `1/1`; final controller/A1 results are
`77/77` and `7/7`. Persistent Globe CloudCore storage is now `7,060,723` bytes
(`-304,274`) with no resource-count, public-API, upstream, generated or SGP
delta. The tree remains uncommitted/unpushed for Architecture review.

The final-source Basic page is `ready · HDR · high · terrain depth owned` with
zero browser/render errors. One direct fast rotation left no persistent
captured screen-space shadow trail; residual shadow softness/block structure
remains for project-owner visual judgment.

## A8-AR-024 through A8-AR-028 execution status — 2026-09-01

Globe cloud transport now keeps the camera-local ENU Sun direction for local
ray/phase work and carries the normalized ECEF Sun direction independently to
Bruneton incident irradiance, ground coupling and BSM. The cloud-body BSM
receiver selects its raw/filtered path from the receiver's local solar
elevation instead of global `Sun.z`. The reference footprint uses
`4 * ceil(resolved / 4)` on each axis, including odd resolved dimensions.

The amended existing GPU fixtures reject local-Sun-as-ECEF, global-Sun-z,
same-UV BSM history, wrong producer/receiver coordinates, cascade-selection
and shape/detail-LOD mutations. They use real camera depth across a
producer-covered cascade transition and derive OD bounds from texel footprint,
structured integration and binary16 storage. Focused fixtures passed, followed
by controller `77/77` and A1 `7/7`.

The retained page is `ready · HDR · high · terrain depth owned` with errors
`0` at high/mixed, coverage `0.4`, density `0.5`, cloud time `0`, cloud
radiance `2`, background/aerial/surface `4/1/10`, and measured Sun elevation
`46.964 degrees` (the timeline pixel nearest the assigned `47.046 degrees`).
One direct ground rotation showed no persistent captured trail; the cloud-top
view remains bright and the ground shadow field remains visibly soft. Those
are owner-visible judgments, not an inferred gate. No standalone navigation
page was edited.

## A8-AR-029 execution status — 2026-09-01

The remaining ground-shadow drift was traced to inconsistent caster geometry,
not to cloud color. The BSM producer marched every visible Globe layer, while
the surface receiver used `base + thickness`; mixed therefore included its
visual-only cirrus layer but reconstructed against a lower, unrelated top
sphere. Globe shadow authority now contains only the reference shadow-enabled
low layers. One shared JS table/helper publishes their exact bottom/top to the
uniform and frame-local surface record, and the GLSL mirror masks BSM density
and support identically. Cirrus-only publishes no active shadow/ray coupling.

The amended existing BSM GPU fixture covers all four preset supports, mixed
low-only production, all-visible-layer and legacy-top mutations, cirrus zero
BSM, and one fixed ECEF receiver through two visible pitch/orbit states. It
samples current raw BSM, resolved BSM and the real Globe surface-lighting
helper; current/resolved/surface remain bounded while the legacy top mutation
fails. The focused fixture passes. No cloud color, radiometry, public API,
resource, upstream, generated, SGP, Planar or navigation-page change was made.

### A8-AR-029 owner-camera correction — 2026-09-01

The owner's saved camera pair and annotated images supersede the preceding
visual statement: both center rays target the same WGS84 terrain location, but
the cloud shadows translate across terrain landmarks. The remaining cause was
the cascade radius changing after nonlinear Globe corner mapping. The exact
views produced `34911.980651 / 34895.930725 m`; center snapping alone therefore
could not preserve the world texel grid.

Cascade radius is now computed from the projection and producer split before
pose-dependent mapping, while mapped corners still determine center/coverage.
Both exact views publish `34913.065606 m` and identical fixed-receiver texel
phase. The existing GPU fixture rejects the former mapped-radius behavior. No
post-edit attempt was made to rediscover the old stochastic cloud bodies after
refresh. Resource/API/upstream/generated/SGP/Planar deltas remain zero.

Final scoped validation passed: exact BSM GPU `1/1`, controller `76/76`, A1
private pipeline `7/7`, focused ESLint/Prettier/Markdownlint and
`git diff --check`.

### A8-AR-032 execution evidence — 2026-09-01

The exact owner-camera fixture located the remaining first divergence after
the receiver: raw BSM texels at three fixed ECEF points were bit-identical, but
the resolve path altered them. Camera-only atlas displacement is now stored in
texels and rounded only when the caller-owned cloud offset is unchanged, while
continuous cloud advection retains fractional displacement. The resolver now
clips history to the finite current `3x3` component range; unlike the former
mean-plus-or-minus-standard-deviation clamp, an exact current/history match
cannot be displaced as an outlier.

The same actual-GPU fixture passes `1/1`: the analytic cascade radius is
`34913.065606 m` in both saved views, three raw producer texels are exactly
equal, and raw receiver, resolved receiver and Globe surface output remain
within binary16-aware bounds. Mapped-radius and camera-derived inverse
mutations fail. No resource, API, upstream-owned, generated, SGP or Planar
delta was introduced.

One fresh final-source page stayed `ready · HDR` with zero browser/render
errors through exactly one saved-camera A-to-B gesture. The new stochastic
scene showed no abrupt whole-field shadow translation. The old annotated cloud
bodies were not searched for after refresh; Natural Earth detail limits finer
landmark judgment, which remains owner-visible evidence rather than a gate.

### A8-AR-033 execution evidence — 2026-09-01

Integer BSM history displacement now additionally requires exact compatibility
of the previous and current cascade half-sizes and atlas resolution. The
renderer retains those four scalar authorities in the existing reusable shadow
snapshot. Equal-scale owner A/B motion keeps history and publishes integer
grid displacement; an accepted `10%` Perspective FOV transition keeps history
but publishes fractional reprojection. An actual-GPU mutation that rounds the
scale-changing case fails. The focused BSM fixture passes `1/1`; resource,
public API, upstream-owned, generated, SGP and Planar deltas are zero.

### A8-AR-034 execution evidence — 2026-09-01

The integer predicate now represents the complete light-space texel lattice,
not scale alone. It requires exact resolution, all three cascade half-sizes and
the already-retained ECEF Sun direction; exact Sun equality deterministically
preserves the derived light basis. A fixed `30 s` Sun transition remains within
the accepted history dot bound and keeps cascade scale equal, but correctly
publishes fractional displacement. A compiled mutation that ignores lattice
orientation rounds it and fails. The focused actual-GPU fixture passes `1/1`
with zero resource, API, upstream, SGP or Planar delta.

## A9-G execution evidence — 2026-09-02

The initial A9-G candidate used one shared Globe shader helper with the fixed
`vec3(0.010, 0.018, 0.030)` readable-night irradiance and the local radial
`-6/-12 degree` transition. Terrain, cloud-body sky, cloud ground bounce,
cloud-local haze and Globe height-fog ambient consume it exactly once in their
existing irradiance/source domains. Direct Sun, Beer attenuation, directional
fog, rays, background/aerial radiance and Planar remain unchanged.

The single actual-GPU fixture passed `1/1` on Chrome 152. It covers factor
boundaries, no-direct-Sun blue-gray terrain with albedo/surface-scale response,
Beer independence, thickness-dependent cloud energy with an A9-removal
mutation, ambient-only fog, exact day identity, Planar identity and finite
RGBA16F storage. The fixed `A9 可读夜景` observation at 15E/45N reported
`Sun -20.120 degrees`, `ready · HDR` and zero browser/render errors; direct
inspection showed a dark terrain/horizon boundary, cool cloud silhouettes and
no bright blue fog veil or viewport-wide fill. Architecture independently
repeated the GPU fixture and upstream/generated audit successfully. The code
gate is approved; exact readability and cloud/terrain contrast remain for the
project-owner visual gate.

## A9-AR-001 execution evidence — 2026-09-02

Execution replaced only the shared private readable-night source with the
authorized exact 2x value `vec3(0.020, 0.036, 0.060)` and synchronized the
existing GPU fixture's source mutation. The production fixture remains `1/1`
successful with day/Planar identity, Beer independence, ambient-only fog and
finite storage intact. One unchanged 15E/45N, `2026-06-21T22:00:00Z` browser
observation reported Sun `-20.120 degrees`, `ready · HDR` and zero
browser/render errors. Terrain and cloud layers are more readable while
retaining the frozen blue-gray balance; final brightness remains an owner
visual judgment.

## A9-AR-001 Architecture re-review — 2026-09-02

Architecture verified the exact `vec3(0.020, 0.036, 0.060)` source and unchanged
helper/consumer boundary, then independently repeated the focused production GPU
fixture with `1/1 SUCCESS`. The same fixed 15E/45N, Sun `-20.120 degrees` page
remained `ready · HDR` with no browser warning/error; terrain and cool cloud
structure are visibly brighter without a viewport fill or seam. `A9-AR-001` is
closed and the owner re-gate is open; visual acceptance is not inferred.

## A9-G project-owner acceptance — 2026-09-02

The project owner inspected the exact 2x readable-night result and explicitly
reported that the current brightness is acceptable. The A9-G visual gate is
therefore passed, all Architecture findings are closed, and the phase is
accepted. No push or successor implementation is part of this acceptance.

## A10-G activation — 2026-09-02

After accepting A9-G, the project owner explicitly requested the Moon as the
next Globe feature and identified Cesium's existing native Moon. Architecture
confirmed the native object is currently hidden and then overwritten by the
later advanced background. A10-G is activated to retain the same native Moon
command and move only the existing `SGP-0008` background slot before it. The
formal implementation assignment is bounded by ADR-0051 and the A10-G phase
plan; the frozen A9 checkpoint is not to be amended.

## A10-G execution evidence — 2026-09-02

Execution moved the existing `SGP-0008` advanced-background invocation before
the unchanged native Moon block, permitted caller-owned visible Moon only in
the Globe conflict policy, and left Planar rejection intact. The existing
render-slot fixture passed `5/5`, the private pipeline passed `7/7`, and the
three focused conflict witnesses each passed `1/1` on Chrome 152. The upstream
audit reports one current-delivery upstream path (`Scene.js`), existing
`SGP-0008`, generated status `0`, new SGP `0`, and zero SceneGIS resource/API
delta. The fixed A10 observation derived native Moon heading `257.917 degrees`
and elevation `7.443 degrees` from Cesium ephemeris at 15E/45N, 500 m,
`2026-06-21T22:00:00Z`; the centered Sun-lit phase was visible above the
horizon with browser/render errors `0`. Cloud interaction remains an owner
visual judgment through the existing control.

## A10-G Architecture review — approved for owner gate 2026-09-02

Architecture independently confirmed the intact paired `SGP-0008` move before
the unchanged exact-once native Moon command, the Moon-only Globe conflict
exception, unchanged Planar rejection, and zero SceneGIS resource/API delta.
Production focused runs from `packages/engine` passed render-slot `5/5`, Globe
Moon acceptance `1/1` and Planar Moon rejection `1/1`; the upstream audit and
diff check passed. A fresh fixed browser observation showed the native textured
crescent above the terrain horizon at azimuth `257.917 degrees`, elevation
`7.443 degrees`, Sun `-20.120 degrees`, `ready · HDR`, with zero warnings/errors.
One existing-cloud toggle retained the Moon in the normal cloud/HDR composition,
after which the page was restored to the fixed clouds-off state. Code review has
no open finding; project-owner visual acceptance is still required.

## A10-G project-owner acceptance — passed 2026-09-02

The project owner inspected the prepared native Moon result and explicitly
reported that it passes. Architecture closes A10-G with no open finding. The
phase-closing local commit containing this record is the isolated unpushed
A10-G checkpoint. No successor phase, moonlight, Moon shadow, alternate asset
or Planar change is inferred.

## P1 activation — 2026-09-02

The project owner explicitly requested the next phase after accepting A10-G.
Architecture froze checkpoint `6afba87af181f3cdb7a20aff09b81af11eb302f4`
and reopened only the Planar A2/A3/A4 integrated-medium track. Current source
and direct-page isolation do not reproduce the historical full-screen white
fill exactly, so ADR-0052 requires a real final-composition witness before any
product correction. P1 targets zero resource/API/upstream/generated/SGP delta;
Globe A1–A10 and every Planar A5+ feature remain frozen.

## A11-G route correction and activation — 2026-09-02

Before P1 entered Architecture review or owner acceptance, the project owner
clarified that the successor must remain Globe-first: Moon lighting, Moon-cast
directional shadows on terrain/3D Tiles/models, and a higher-quality lunar
surface. Architecture stopped the P1 execution route, preserved its unaccepted
candidate outside committed delivery, and retained frozen A10-G product
checkpoint `6afba87af181f3cdb7a20aff09b81af11eb302f4` as the A11-G predecessor.

Source discovery confirms one native `scene.light` and one native
`scene.shadowMap` already feed Globe/3D Tiles/Models, while caller-owned
`scene.moon.textureUrl` can replace only the lunar color payload without
copying the body. ADR-0053 therefore activates one shared ECEF primary-light
authority, stable light/shadow ownership, existing SGP-0009 surface publication
and an exact pinned NASA CGI Moon Kit color asset. P1 remains deferred; lunar
eclipse, displacement/normal Moon material, second light/shadow/body, Planar
execution and unrelated A1-A10 recalibration are not authorized.

## A11-G execution candidate — 2026-09-02

Execution implemented one Globe primary-light authority shared by the accepted
surface, cloud, Beer-shadow and native `DirectionalLight` consumers. The
controller now owns and restores only the light, native shadow enablement,
Globe `ShadowMode` and native Moon texture URL that it actually changes. The
pinned `2048 x 1024` Moon color asset is delivered with exact provenance,
NASA notice and MIT license; URL resolution is deferred until Globe activation
so bare Node/CJS import remains browser-independent.

Focused final validation is green: controller `75/75`, A1 pipeline `7/7`,
Moon importer `2/2`, `packages/engine` TypeScript, release build, installed
package/provenance verification and upstream-patch audit. The fixed 15E/45N
observation reports Moon elevation `21.467 degrees`, Sun elevation
`-20.763 degrees`, `ready · HDR` and zero browser/render errors; the native
Moon and bounded local caster/receiver are visible together. Architecture
review and project-owner visual judgment remain pending.

## A11-G review correction candidate — 2026-09-02

Execution corrected A11-AR-001 through A11-AR-005 without expanding the
resource or ownership boundary. Sun and Moon phase vectors now share the
Earth-fixed frame; the fixed Lambert phase is `0.9326044744950956` and the
rejected mixed-frame mutation is `0.29384491398532053`. The controller's
current `time` now reaches the renderer before resource publication, the Beer
producer/body/surface receiver share `primaryLightDirection`, and Moon/light/
shadow restoration is identity/value guarded.

Compiled surface/cloud endpoints, the real Beer atlas path and one native
Model-to-Primitive caster/receiver pass. The native result is unchanged by a
camera-only rotation while the same Scene-owned ShadowMap remains shared with
Globe. Final controller=`79/79`, A1=`7/7`, `npx tsc` and upstream audit pass.
The one refreshed fixed A11 page remains `ready · HDR`, Moon `21.467 degrees`,
Sun `-20.763 degrees`, errors `0`; this reproducible local witness does not
reuse the project owner's earlier cloud-shadow screenshots.

## A11-G final correction continuation — 2026-09-02

The Globe surface seam now carries actual Sun and primary-light directions as
separate frame-local uniforms. Physical Bruneton sky and A9 night ambient use
the actual Sun; direct irradiance and every A5 Beer lookup retain the selected
Sun-or-Moon primary direction. The compiled night fixture keeps the actual Sun
fixed below the horizon while changing only the primary receiver direction.

The bounded lifecycle fixture now exercises light replacement, Moon
replacement, `shadowMap.enabled` mutation and `globe.shadows` mutation in four
independent activation cycles. It also proves Moon below-horizon zero and the
fixed 21.467-degree endpoint at full horizon factor. The native shadow witness
uses two distinct camera positions and directions on one fixed receiver and
one Scene-owned ShadowMap; both views distinguish caster disabled/enabled.

Final focused results are primary/lifecycle `1/1`, night/native shadow `1/1`,
Beer atlas `1/1`, controller `76/76`, A1 `7/7` and `npx tsc` exit `0`. The
single refreshed fixed page remains `ready · HDR`, Moon `21.467 degrees`, Sun
`-20.763 degrees`, errors `0`; it uses the reproducible local witness rather
than attempting to recover pre-refresh cloud-shadow locations.

## A11-AR-006 isolated fixture correction — 2026-09-02

The lifecycle Spec now installs one deterministic caller-owned native `Moon`
and URL before A11 activation. It no longer depends on a prior Viewer-backed
test having populated `scene.moon`; all existing capture, mutation and release
assertions remain unchanged. The exact isolated lifecycle filter passes `1/1`,
the exact compiled night/native-shadow filter passes `1/1` rather than `0/0`,
and the final controller include passes `78/78`. No product or browser path was
changed or rerun.

## A11-AR-006/007 final execution — 2026-09-02

The isolated lifecycle helper now reuses pending deferred resources after its
first eight requests, so every explicit re-acquisition reaches the intended
light, Moon, ShadowMap or Globe ShadowMode validation. The exact isolated
lifecycle filter is reproducibly `1/1`.

The previously frozen A5/A8 Beer producer had a geometry defect exposed by
A11's low Moon angles: its ray began 100 km above cloud top and spent the same
200 km budget reaching the medium. The producer now starts directly on the
Sun-facing cloud-top shell; the 200 km limit applies only to useful shell
traversal. Global ECEF lattice, cascades, receiver/history protocol and all
resources remain unchanged.

The amended actual-GPU atlas fixture rejects the inflated-origin mutation and
proves finite nonzero atlas, receiver optical depth and packed crepuscular
length at the fixed 27.019736617450597-degree Sun and 21.467-degree Moon endpoints while
retaining the existing high-Sun authority. Exact results are lifecycle `1/1`,
Beer atlas `1/1`, compiled night/native shadow `1/1` and controller `79/79`.
One browser reload shows the existing 2.175-degree low-Sun state and the fixed
A11 Moon state `ready · HDR`, errors `0`; no historical cloud location was
used.

The low-Sun fixture timestamp is fixed at `2026-06-21T16:00:00Z`; its actual
product elevation at 15E/45N is `27.019736617450597 degrees`. The earlier
`26.725 degrees` label was corrected without changing the below-30-degree
state or any product source.

## A11-G project-owner acceptance — 2026-09-04

The project owner explicitly passed the prepared A11-G visual gate, including
the low-angle cloud-shadow and crepuscular-ray correction. Architecture closes
A11-AR-001 through A11-AR-007 with no open finding. The exact final Beer-atlas
GPU filter was independently verified as `1/1 SUCCESS`; the isolated lifecycle
filter also passed `1/1`. Earlier accepted build, type, asset/package and native
shadow evidence is retained without repeating unrelated validation.

The phase-closing local commit containing this record is the isolated A11-G
checkpoint. Current-phase upstream changes are confined to
`packages/engine/Source/Scene/GlobeSurfaceTileProvider.js` under existing
`SGP-0009`; generated changes and new SGP count are zero. No push, successor
implementation or Planar activation is included. The owner's newly reported
cloud grain is a separate follow-up, not a reopening of the accepted light and
shadow result.

## A12-G execution candidate — 2026-09-04

The existing Globe resolve now accumulates finite 3x3 RGBA moments and clips
history coherently to the gamma-1 mean/sigma AABB inside the existing extrema.
The implementation changes only CloudResolve GLSL and its existing history
fixture. Shader lookups, spatial weights, temporal weights, distances, shadow
packing, resources, APIs, A11 and Planar remain unchanged. Detailed validation
and the same-view browser observation are recorded in the
[A12 review](reviews/2026-09-04-a12g-globe-cloud-noise-reduction.md). This is an
uncommitted candidate, not visual acceptance: visible fine grain remains and
clear live improvement is not established.

Final isolated history is `1/1 SUCCESS`; the one controller run reported three
other existing fixture failures and then Chrome crashed, so no aggregate pass
is claimed. Execution stopped without retry or expansion; Architecture review
must address this validation result and the unresolved visual benefit.

## A12 correction execution — 2026-09-04

A12-AR-001 now uses RGB alone for the coherent clipping fraction and clamps
transmittance independently. The existing actual-GPU history fixture retains
the outlier/uniform/edge/motion checks and proves the recorded alpha-only ULP
case returns RGB `0.3125` and alpha `0.75`, not RGB `0.25`.

A12-AR-002 setup/oracle corrections stay in the existing Spec. The Beer
fixture now passes the same fixed time to controller update and Scene render.
The Moon oracle uses rotation-invariant inertial-frame phase instead of
ICRF-readiness-dependent epoch goldens, retaining the mixed-frame mutation
and existing tolerances. The readable-night probe now distinguishes local
`+Z` from its virtual Globe point's `+X` zenith; its controlled surface atlas
uses density `0.0001` so the 6 km zenith path has OD about `0.6`, rather than
OD `60` erasing both direction witnesses in half-float output. Product
lighting/shadow code is unchanged.

All four corrected isolated fixtures passed sequentially on Chrome 152.
A12-AR-003 remains unproven: this correction turn's browser discovery returns
no accessible tab. No replacement page was opened and no refresh, camera,
parameter or live-state mutation was performed. The earlier grain observation
is not superseded by a new visual claim. Resource, lookup, API, upstream,
generated and SGP deltas remain zero; the candidate stays uncommitted/unpushed.

Final controller qualification is `78 SUCCESS, 1 FAILED` (79 executed), not a
pass despite shell exit 0. The remaining unchanged
`loads exact Globe assets and publishes the height/time/projection render matrix`
fixture supplies its selected times only to Scene rendering, not to its
directly connected controller inside the loop; its Sun-direction-change
assertion fails. It is outside the three-fixture repair scope and is left
untouched for Architecture. No rerun or scope expansion. A12-AR-002/003 remain
open; exact commands and failure are appended to the A12 review.

## A12-AR-002 final Spec follow-up execution — 2026-09-04

Added only the two authorized `effects.update` calls before the existing
selected-time and final Orthographic renders. No assertion, parameter or
product change. Exact command
`npm run test -- --includeName "loads exact Globe assets and publishes the height/time/projection render matrix"`
passed `1/1 SUCCESS` on Chrome 152 (36.942 s Spec). The previous aggregate
remains `78 SUCCESS / 1 FAILED`; no new aggregate or other fixture was run.

A12-AR-003 remains open: original-tab discovery still returns zero accessible
tabs. No replacement page, reload or live-state mutation; no visual benefit
is claimed. New executable delta is only these two Spec lines.
Upstream/generated/new SGP/API/resource/Planar deltas are zero. Shared
candidate remains uncommitted/unpushed and returns for Architecture review.

## A12-AR-003 execution access limitation — 2026-09-04

After Architecture reported successful access to the original tab, Execution
performed the required single read-only inventory. Its own browser surface
still returned `tabs=[]`. Thus Architecture's successful access does not
currently extend to this execution context. No tab was selected, opened,
refreshed or polled again; no camera, time, parameter, loop or shader changed.
Current-state capture, loaded-shader verification and a valid same-state
comparison/drag observation could not be performed. A12-AR-003 remains open,
with no visual benefit or acceptance claimed. A12-AR-001/002 stay frozen.
This update changes records only; no tests, product edits, commit or push.
