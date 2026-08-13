# ADR-0033：平面环境手动天体方向与光照

## 状态

- Status：`approved`
- Date：`2026-08-13`
- Decision owners：Architecture Agent
- Related plan：`AgentDocs/planar-environment/plans/2026-08-13-phase-e1-manual-celestial-light-contract.md`
- Related patch：无；upstream-owned files=`0`、SGP=None

## 上下文与源码事实

Cesium `ControllerHost.registerController`先把Controller加入host，再调用`connectedCallback`；首次enabled frame才按
`firstUpdate`、`update`顺序运行。`Scene.render`在Controller更新后才把`scene.light`复制进`frameState`。
默认`SunLight`依赖Earth天文与坐标语义，而`DirectionalLight`直接消费显式传播方向。任意planar CRS不能继承
Earth Sun/Moon方向。`SceneGISPlanarWorld`目前只消费`frameState.light`，不拥有Scene light。

## 决策

新增caller-created、caller-registered `SceneGISPlanarEnvironment` Controller。构造必须接收live
`SceneGISPlanarWorld`以及manual `sunDirection`、`moonDirection`；坐标轴固定为`+X East/+Y North/+Z Up`，公开方向均为
observer-to-body。方向先按最大绝对分量缩放再normalize，避免finite大值overflow或小值underflow。公开方向和颜色clone
in/out，强度为finite non-negative。Environment保存一个稳定`DirectionalLight`，其传播方向恒为normalized
`-sunDirection`；Moon方向在E1只保存，不显示天体、不产生第二光源。

`world.environment`是readonly已注册reference，不是constructor option或ownership入口。同一个live world最多注册一个
Environment，即使既有instance disabled或尚未first update也保持独占。World destroy只调用SceneGIS soft-private sever：
conditional restore、清Scene authority和registry，保留host connection marker直到caller真正remove；不destroy
Environment、stable light或displaced light。

`connectedCallback`完整验证后才原子记录element与world registry，不写Scene light。`firstUpdate`验证registry、live Scene、
`scene.world===world`和`SCENE3D`后才capture当前`scene.light`并取得authority。active `update`每帧纠正并reassert同一light，
并为首次authority acquisition单次`scene.requestRender()`。后续active `update`每帧纠正并reassert同一light，但不request
render。active property mutation与重新enable同步light并单次request；inactive mutation只更新state。

`enabled=false`、disconnect或World sever仅在`scene.light===environment.light`时恢复captured reference；外部已替换light时保留
外部override。重新enable会capture当时light再取得authority。注册失败或scene/mode/world校验失败不得部分改变Environment、
registry或Scene light。由于ControllerHost在callback前插入，调用方只能注册已合法构造的instance；E1不patch host或虚构host
rollback。

Environment authority是scene-wide，会影响Models、3D Tiles等所有`scene.light`consumer；它不自动设置
`world.enableLighting`。调用方必须在destroy Widget/Viewer前`removeController(environment)`；Environment不增加
`destroy/isDestroyed`。

## 不采用的方案

- 不使用native Earth `SunLight`、`Sun`、`Moon`、automatic celestial uniforms或CRS推断。
- 不自动注册、不增加World constructor environment option，也不修改ControllerHost或Viewer集成。
- 不在E1加入天文时间、reference location、可见天体、atmosphere、SkyBox、shadow或moon light。
- 不修改Surface shader、terrain/imagery runtime或render loop。

## 兼容性与升级

E2加入天文模式前必须保留manual state、fixed axes/sign、stable light、one-per-world registry、enabled authority、conditional
restore、requestRender与caller ownership；自动模式只能作为显式authority输入，不能重新引入Earth隐式方向。Cesium升级时
复核ControllerHost callback/update顺序、Scene frame light复制顺序、`DirectionalLight`属性语义、Scene destroy顺序与
request-render行为。

## 验证

- Constructor/setter normalization、clone、no-op、failure atomicity与one-per-world unit Specs。
- Real Context方向符号、斜坡pixels、颜色/强度、requestRender、warm terrain/imagery/GPU identities与authority lifecycle。
- Local deterministic中文Sandcastle、build/types/docs/installed package与ownership/generated审计。
