# ADR-0035：平面可见天体

## 状态

- Status：`approved`
- Date：`2026-08-13`
- Decision owners：Architecture Agent
- Related plan：`AgentDocs/planar-environment/plans/2026-08-13-phase-e3-visible-celestial-bodies.md`
- Related patch：`SGP-0003`

## 上下文

Native `Sun`/`Moon`使用Earth-centered位置、physical尺度、纹理和automatic uniforms，不能表达项目原点
topocentric planar ENU方向。普通command pass也没有可执行的environment slot。

## 决策

`SceneGISPlanarEnvironment`以默认关闭的`showSun`/`showMoon`、CSS-pixel尺寸和`moonColor`提供可见状态；
Sun颜色复用`sunColor`，`sunIntensity`仍只控制光照。Renderer只消费E2 effective directions和原生Clock经
ControllerHost发布的time，不创建第二套time authority。

`SceneGISPlanarWorld`拥有一个SceneGIS private procedural renderer。首次有效显示时lazy创建一个shared quad VA、
一个fixed ShaderProgram和两个stable DrawCommand；不使用texture、sampler、FBO、asset或network。World destroy
exactly-once释放资源，caller-owned Environment和native body仍不归World所有。

Perspective family按当前frustum slope执行gnomonic projection；orthographic family使用保留off-center shift的virtual
90-degree celestial field。尺寸是CSS pixels。方向`z<=0`、camera后方、world/environment隐藏以及camera低于resident
terrain（无resident时Z=0）时不绘制。Body在ordinary geometry前直接执行且不写/test depth，后续terrain/model自然覆盖；
不进入commandList、pick、depth、shadow或classification。

当对应native `scene.sun`/`scene.moon`的`show !== false`时，SceneGIS body fail-fast，且不接管或修改native对象。
Appearance mutation只更新uniform state并请求必要一帧，保持warm GPU identity。

## 上游缝隙与升级

`SGP-0003`只在`Scene.renderEnvironment`末尾结构化调用optional
`world.renderEnvironment(frameState, passState)`。升级Cesium时复核environment调用仍发生在ordinary geometry前、
只在normal non-pick execution中发生、passState framebuffer语义未变；若upstream提供等价primary-world slot则移除补丁。

`Scene.js`同时承载既有`SGP-0001`，但两个SGP不得合并：前者是primary-world lifecycle，`SGP-0003`仅是environment
render slot，升级移除条件不同。官方审计器按registration status处理同一路径多个SGP：`active`必须有完整pair，
`proposed`可尚未落地但一旦存在marker就必须完整并参与合法range并集，`retired`只保留manifest历史且不得保留marker或覆盖
live diff；任何`manifest-only`混用、foreign marker、nested/misordered pair或unmarked hunk均失败。

同时复核四类frustum bounds、Context canvas/drawing-buffer尺寸、Shader source glob、ShaderProgram cache/release和
`world.getTerrainHeight` resident-only语义。改变pass、depth、asset、phase/atmosphere或physical accuracy需要新决定。

## 验证

Focused unit/private/real-Context覆盖public validation、native conflict、projection/horizon/underground、compile/link/pixels、
warm identity和destroy；build/types/docs/installed tar验证两份GLSL与generated modules以及private hiding。
