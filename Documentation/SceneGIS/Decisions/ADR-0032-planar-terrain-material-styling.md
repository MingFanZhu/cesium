# ADR-0032：平面地形 Material Styling

## 状态

- Status：`approved`
- Date：`2026-08-12`
- Decision owners：Architecture Agent
- Related plan：`AgentDocs/planar-surface-styling/plans/2026-08-12-phase-s3-planar-terrain-styling.md`
- Related patch：无；upstream-owned files=`0`、SGP=None

## 上下文与源码事实

Cesium `Material`已把Fabric组装为`shaderSource`，并通过`_uniforms`与`update(context)`管理live uniform和
Material-owned texture。Globe组装的`czm_materialInput`依赖椭球语义，不能用于平面world。Planar Surface已有single
opaque command、imagery composition、smooth oct normal、geometric fallback与normal-render replay边界。

## 决策

`SceneGISPlanarWorld.material`接受caller-owned live `Material | undefined`，默认`undefined`且不是constructor option。
getter返回同一reference；invalid assignment在mutation前抛`DeveloperError`；相同reference为no-op。World替换、清空和
destroy均不destroy Material、sub-material或texture。

Surface直接插入assembled `material.shaderSource`，组合其soft-private `_uniforms`，并在通过sampler preflight后的实际
normal render调用`update(context)`。identity/source只由下一次成功normal render发布；depth/pick-only replay继续使用旧
command。uniform value不进入variant key；Material-defined variant包含layer count、lighting、normal mode与source。
成功发布后释放旧Material-specific shader reference，不建立global或unbounded identity registry。
Material variant在selection、command mutation与旧shader release前通过`ShaderProgram._bind()`完成真实Context compile/link；
任一variant失败时释放全部candidate并保持旧publication/replay。释放旧source时同时使所有resident tile的对应command
source metadata失效，确保缓存tile重新进入selection后不会复用已由`ShaderCache`释放的program。

平面input固定为tile-local normalized `st`、`s=st.s`、`str=vec3(st,0)`、topology-up `normalEC`、
`positionToEyeEC=-positionEC`、eye-space East/North/Up basis、absolute meter world Z `height`、relative `+Z` slope、
north-clockwise downslope aspect和`waterMask=0`。8-bit oct normal在水平投影不超过`2/255`的一个quantization bin时只把
style slope/aspect snap为0；lighting normal不snap，也不以`abs(dot)`掩盖winding。

composition固定为base、imagery filters/layers、Material diffuse/alpha source-over、一次既有Lambert lighting、opaque
output。只消费`czm_material.diffuse/alpha`；normal/specular/shininess/emission/translucent pass不受支持。稳定资格集为
`ElevationContour`、`ElevationRamp`、`SlopeRamp`、`AspectRamp`；custom Fabric只保证本文初始化的input字段。

最终Material source中去重的`sampler2D`/`samplerCube` declaration与shown imagery数相加，并在selection、request、
Material update和Surface GPU mutation前对`maximumTextureImageUnits` fail-fast。Material `undefined`不增加define、source、
varying、normal requirement、uniform或sampler，保持S2 unlit/lit fast path。

## 不采用的方案

- 不复制GlobeFS、ellipsoid ENU或Material builtin。
- 不新增SceneGIS style type、Material cache、multipass或CPU texture处理。
- 不把uniform值写入shader key，也不让setter清空replay或创建Context资源。
- 不把Material ownership转给World。

## 兼容性、发布与升级

`Material._uniforms`与compile-before-publication使用的`ShaderProgram._bind()`是明确的soft-private seam。Cesium升级时复核
Material source assembly、uniform suffix、texture update/destroy、sampler declarations、`czm_materialInput` struct、四个
builtin source、`czm_octDecode` range、shader compile/cache release、dev/release/npm shader交付。任何normal packing、
aspect约定或supported output扩展先形成新ADR/phase。

## 验证

- Public ownership、failure atomicity、normal/depth publication与warm identity Specs。
- 四个stable builtin和texture-unit maximum的real-Context compile/link/render。
- Absolute height、slope/aspect、composition/lighting、flat/LOD/underground与caller destroy balance的deterministic pixels。
- Build/types/docs/package/gallery/static/ownership audits。
