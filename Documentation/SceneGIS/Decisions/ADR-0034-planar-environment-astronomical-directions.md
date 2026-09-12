# ADR-0034：平面环境天文方向

## 状态

- Status：`approved`
- Date：`2026-08-13`
- Decision owners：Architecture Agent
- Related plan：`AgentDocs/planar-environment/plans/2026-08-13-phase-e2-astronomical-direction-mode.md`
- Related patch：无；upstream-owned files=`0`、SGP=None

## 上下文与源码事实

ControllerHost把当前simulation `JulianDate`显式传给Controller。Cesium 1.144的
`Simon1994PlanetaryPositions`可从该time计算Earth-centered inertial Sun/Moon positions；省略time才读取系统时间。
`Transforms.computeIcrfToCentralBodyFixedMatrix`会随async XYS/EOP readiness改变路径，而
`computeTemeToPseudoFixedMatrix`是同步UT1≈UTC approximation。`eastNorthUpToFixedFrame`提供WGS84 observer处固定
east/north/up basis。

## 决策

`SceneGISPlanarEnvironment`增加`directionMode="manual"|"astronomical"`、optional WGS84 project-origin
`originLongitude`/`originLatitude`（radians）以及readonly clone getters `effectiveSunDirection`/
`effectiveMoonDirection`。Astronomical mode必须同时具备合法origin；origin height固定0m。应用必须声明该anchor，Environment不从
CRS、extent、provider、camera或planar coordinate推断。

Astronomical calculation只消费ControllerHost传入的finite `JulianDate`。Sun/Moon inertial positions固定经
`computeTemeToPseudoFixedMatrix`进入pseudo-fixed frame，各自减去WGS84 observer fixed position后，仅以ENU inverse rotation
转换line-of-sight vector。ENU直接映射planar `+X East/+Y North/+Z Up`；整张平面共享该project-origin方向。Moon保留
topocentric parallax。

Sun、Moon、time和origin candidates全部成功后才原子发布effective state、cached time与stable
`DirectionalLight.direction=-effectiveSunDirection`。失败保留上次成功publication、light、authority与request state并上抛。
Manual direction setters在astronomical mode只更新fallback；切回manual才同时发布两份fallback。Mode/origin active mutation请求
下一帧；同time clean update不计算也不request；host time变化在当前frame发布。E1 one-per-world、conditional restore、caller
ownership与World sever不变。

## 精度与非目标

该Simon1994 + TEME pseudo-fixed组合采用UT1≈UTC，只承诺离线、确定的visual-grade方向。它不承诺navigation、survey、
arcsecond、eclipse或高精度定位。E2不显示Sun/Moon、不增加moon light、timer、listener、Promise、network或GPU resource，
也不使用native Earth Sun/Moon/SkyAtmosphere automatic uniforms。

## 兼容性与升级

Cesium升级时复核Simon1994显式time contract和输出frame/unit、`computeTemeToPseudoFixedMatrix`方向与同步性、WGS84
`cartographicToCartesian`、ENU matrix columns、ControllerHost first/update time以及JulianDate equality。任何改用ICRF/EOP、改变
accuracy承诺或增加per-XY observer必须形成新决定。

## 验证

- Unit固定time/origin hard-coded Sun/Moon vectors、timezone-equivalent instant、季节、极点、Moon parallax、clone与原子失败。
- Real Context local terrain/imagery pixels、mode/time/origin requestRender与warm resource identity。
- Build/types/docs/installed package public runtime、declaration和API anchors，加直接中文Test页面manual gate。
