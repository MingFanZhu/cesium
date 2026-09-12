# ADR-0031：平面影像颜色滤镜

## 状态

- Status：`approved`
- Date：`2026-08-12`
- Decision owners：Architecture Agent
- Related plan：`AgentDocs/planar-surface-styling/plans/2026-08-12-phase-s2-planar-imagery-color-filters.md`
- Related patch：无；upstream-owned files=`0`、SGP=None

## 上下文与源码事实

ADR-0005建立canonical planar imagery runtime与single opaque Surface command。S2前layer只有`show`与`alpha`；
normal render把texture、translation/scale和alpha复制到tile slot，uniform closure只读slot。depth/pick-only pass只重提
最后一次normal render的command。shader key固定为layer count、lighting与normal mode。

Globe的coordinate-independent filter数学可参考，但其default gamma路径调用`czm_gammaCorrect`。当前planar sampled
color space没有该步骤，因此S2只复用`czm_hue`与`czm_saturation`，不宣称与Globe HDR pipeline完全等价。

## 决策

`SceneGISPlanarImageryLayer`增加`brightness`、`contrast`、`hue`、`saturation`、`gamma`、`colorToAlpha`和
`colorToAlphaThreshold`。brightness/contrast/saturation为finite non-negative，hue为finite radians，gamma为
finite positive，threshold为finite `[0,1]`。默认依次为`1,1,0,1,1,undefined,0.004`。invalid constructor/setter在
mutation与notification前抛`DeveloperError`。

`colorToAlpha`只接受undefined或RGB为finite normalized的`Color`，alpha忽略；constructor/get/set defensive clone，
RGB相同赋值为no-op。target存在时，只有`max(abs(rawSample.rgb-target.rgb)) < threshold`才把sample alpha置零；
threshold 0严格不匹配。

每个shown layer始终声明完整uniform set，不增加feature define或shader key。identity defaults由uniform branch精确
跳过。每层顺序固定为raw sample、color-to-alpha、`pow(rgb, 1/gamma)`、brightness、contrast、`czm_hue`、
`czm_saturation`、sample alpha乘layer alpha、bottom-to-top mix。所有layer完成后只运行一次既有terrain lighting。

Surface只在normal render把live layer值复制进per-tile slot。color target使用persistent `Cartesian4`，`w`作为private
enabled sentinel；uniform closure只读slot。setter后的depth/pick replay仍看到旧快照，下一normal render才原地发布。
Filter mutation不release imagery、不改变readiness/tilesLoaded、不发请求、不上传texture，也不替换binding、mesh、VA、
DrawCommand、ShaderProgram或shader map identity。

## 不采用的方案

- 不复用Globe `ImageryLayer`或整段`sampleAndBlend`，避免Earth runtime与default gamma语义。
- 不把非默认filter加入shader key，避免setter触发compile和variant组合爆炸。
- 不做CPU canvas或multipass，避免新增texture/request/framebuffer ownership。
- 不让uniform直接读取live layer，避免depth replay越过normal-render发布边界。

## 兼容性、发布与升级

本决定扩展public layer API，但不改变provider/collection ownership、canonical tiling、request/cache、fallback、
texture-unit预算或terrain lighting。Dev/release/types/docs/installed tarball必须覆盖新属性；Sandcastle只用于人工
best-effort OSM gate，自动化使用本地canvas fixture。

Cesium升级时复核`czm_hue`/`czm_saturation`、builtin dependency scan、persistent `Cartesian4` uniform、fragment
uniform limit、identity branches、shader key、normal/depth replay以及dev/release/npm shader交付。任何颜色空间或默认
像素变化先形成finding，不用`czm_gammaCorrect`静默对齐Globe。

## 验证

- Public contract、defensive clone、RGB no-op与failure atomicity Specs。
- Shader顺序、完整uniform shape、identity bypass与normal-render snapshot Specs。
- 本地real-Context pixels覆盖五个scalar filter、color-to-alpha、multi-layer alpha/order与默认像素。
- 复跑lit terrain qualification，并完成build/types/docs/package/gallery/static/ownership audits。
