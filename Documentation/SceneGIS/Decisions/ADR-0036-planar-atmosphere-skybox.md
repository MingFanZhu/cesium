# ADR-0036：平面大气与固定轴 SkyBox

## 状态

- Status：`approved`
- Date：`2026-08-13`
- Decision owners：Architecture Agent
- Related plan：`AgentDocs/planar-environment/plans/2026-08-13-phase-e4-planar-atmosphere-skybox.md`
- Related patch：`SGP-0003`（只读依赖）

## 上下文

Native `SkyAtmosphere`是ellipsoid shell并依赖Earth radii，native `SkyBox`缺省使用TEME方向，二者都不能表达固定
`+X East/+Y North/+Z Up`的planar visual environment。`Scene.destroy()`还会销毁native Scene slots，因此caller-owned
planar SkyBox不能写入`scene.skyBox`或`scene.skyAtmosphere`。

## 决策

`SceneGISPlanarEnvironment`新增默认关闭的`showAtmosphere`以及zenith/horizon color、visual intensity和meter-based
fade height；默认颜色分别为`Color(0.12, 0.32, 0.72, 0.72)`与
`Color(0.92, 0.56, 0.28, 0.58)`。颜色clone in/out，scalar严格validation；active visual mutation请求一帧，
same-value与inactive mutation不产生无意义request。

Public `SceneGISPlanarSkyBox`只接受六个已经加载、同类型且非URL的face，固定映射positive X=East、positive Y=North、
positive Z=Up。它内部以`Matrix3.IDENTITY`和soft-private `CubeMapPanorama({returnCommand:true})`取得command，但不公开
transform或return-command seam。Sources构造后固定；Environment和World只保留reference，永不destroy SkyBox、cubemap或
credit。调用方必须在clear/remove之后、WebGL Context销毁之前调用`destroy()`。

World拥有一个private fullscreen atmosphere renderer。首次show或地下mask需要时lazy创建一个quad VA、一个fixed
ShaderProgram与一个stable command；不创建texture、sampler、FBO、postprocess或derived command。Shader只消费planar
camera world axes/frustum、resident terrain height、E2 effective Sun direction、两色、intensity与fade height。Perspective
按frustum slopes重建ray；orthographic使用固定camera-forward directional sky。输出采用straight-alpha source-over。

既有`SGP-0003`hook内顺序固定为planar SkyBox→planar atmosphere→E3 Sun/Moon→ordinary geometry。统一validator在任何
E4 allocation/execute前拒绝冲突的native environment。Camera严格低于resident terrain（无resident时Z=0）时，planar
SkyBox/atmosphere/bodies全部隐藏。

ADR-0039/I4后续取代了“planar atmosphere + visible native generic background”的public配置：live non-Globe Scene中的visible
native `SkyBox`、`SkyAtmosphere`、Sun和Moon会在frame publication及E4 hook前失败；应用的sky、atmosphere和body只能使用
`SceneGISPlanarEnvironment`。Atmosphere renderer中以`scene.backgroundColor`和alpha=1输出的underground opaque-mask分支仅保留为
defensive/private compatibility seam，用于隔离无法由应用配置到达的旧集成状态；它不是public能力，也不是配置native sky的依据。

Public World/Surface保持single Context。Private renderer仅在异常Context mismatch时释放旧资源并recreate；candidate失败
保持empty/retriable。Disable、clear、replacement、Environment disconnect或World/Scene destroy均不转移caller SkyBox
ownership。

## 上游缝隙与升级

E4不新增upstream diff或SGP，只消费ADR-0035定义的`SGP-0003`。升级Cesium时必须复核：environment hook仍位于native
background/panorama之后和ordinary geometry之前；`CubeMapPanorama`仍支持显式`Matrix3.IDENTITY`、同步preloaded faces与
return-command；returned command ownership、credit和destroy语义未变。`Scene._environmentState`对已经执行的native
SkyBox/SkyAtmosphere的区分只服务上述private defensive mask，不构成public配置；若I4 guard或Scene顺序使其永久不可达，可在独立
审计后移除。任一soft-private seam改变时必须先更新focused tests和本ADR，不能把planar SkyBox写入Scene-owned slots或复制native
renderer。

## 验证

Focused Environment/SkyBox/private renderer/World/real-Context覆盖validation、fixed axes、caller ownership、candidate cleanup、
four-frustum projection、day/twilight/night inputs、height fade、composition、native conflict、underground mask、pick/depth隔离、
warm identity和exactly-once destroy。Build/types/docs/installed tar验证12份GLSL及12份generated modules、公有API和private hiding。
