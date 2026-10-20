# ADR-0173：原生 CZML 的实例级平面 World

- Status: accepted
- Date: 2026-10-20
- Baseline: Cesium 1.144 / `6d5d8b1f0725b6f831b336463f4b11c98023427b`
- Related: ADR-0016、ADR-0020、ADR-0172；SGP-0063
- Plan: [planar-czml](../../../AgentDocs/planar-czml/plans/2026-10-20-native-loading.md)

## 决定

```js
const source = await Cesium.CzmlDataSource.load(packets, {
  planar: { world: viewer.scene.world },
});
await viewer.dataSources.add(source);
await viewer.zoomTo(source);
viewer.trackedEntity = source.entities.getById("vehicle");
await source.process(nextPackets);
```

首次 load/process 固定实例坐标域；`planar.world` 必须是 live `SceneGISPlanarWorld`。
后续省略选项继承绑定，显式更换 World 或从已使用的 Globe 实例改成 Planar 拒绝。
新坐标域需要新实例。World 由调用方拥有，加载器不销毁或订阅它；异步加载完成时复验。

位置直接为当前 World 的有限米制 XYZ，固定 X east / Y north / Z up。
原生 `cartesian`、`cartesianVelocity`、采样、插值/外推、interval、reference、availability、
document clock 和 load/process replace/merge/delete 原样共享。
`referenceFrame` 缺省或 `"FIXED"` 均表示该平面固定坐标域。
不接受位置的 cartographic、spherical、unit coordinate encodings 或非 FIXED 系。
Quaternion 朝向使用固定平面轴；`orientation.velocityReference` 依赖椭球法线，明确拒绝。
业务 `properties` 不被当作空间字段重写。

既有平面 Graphics profile 不扩宽；Path 使用 FIXED sampler，线面缺省直线。
Polygon 的 height/perPositionHeight 与显式地表语义仍由原生属性和当前平面 Visualizer 控制。
Rectangle 的 `wsen` 沿用平面 Graphics 米制边界解释，`wsenDegrees` 不允许。
不自动转换地理 CZML、不新增 class、进程级 updater 或第二套时序系统。

Native load 在 suspended EntityCollection 中删除并重建同 ID 对象时，会合并为 changed 通知。
Planar Visualizer 必须检查 Entity identity，释放旧对象的 owner / async generation 并跟踪新实例；
普通 process 修改同一 Entity 时保持资源复用。调用方保存的 Entity 引用仍按 native 语义失效，
重新跟随需要取得新 Entity 并设置 `trackedEntity`。

## 集成与严格绑定

SGP-0063 在 `CzmlDataSource.js` 加入实例 options 与加载前置校验；
所有坐标策略位于 SceneGIS-owned helper。校验在 native 清空/解析前，不复制上游加载器，
其余解析错误继续遵循原生非事务语义、error/loading 事件和 Promise 行为。

Planar callback 接纳绑定当前 World 的 CZML；未配置 CZML 不能用于 Planar Viewer。
`DataSourceDisplay.js` 正常 update 在任何 child visualizer update 前检查显式绑定；
错 World、Globe 使用与已销毁 World 都拒绝，包含数据源先添加后加载的情况。
不在 native collectionAdded listener 中增加可抛错路径，保留容器 remove/destroy 行为。
这是 ADR-0016 原阶段只改 Widget 的边界之外，由本独立扩展批准的最小显示缝隙。
默认球面 CZML 只经过一次无绑定快速返回，其解析和 visualizer 不变。

## 验证与升级

覆盖 native CZML 和 DataSourceDisplay 回归，SceneGIS 的时间语义/坐标/绑定 Specs，
实际 GPU Viewer 动态点、Path、定位、跟随与销毁；执行完整 release 和类型消费。
升级复核 load/clear 顺序、位置编码、native Property/Path sampler 和 display update 顺序。
不承诺不受支持的 material、INERTIAL、VVLH 或基于椭球的速度朝向。
