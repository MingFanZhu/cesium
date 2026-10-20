# ADR-0172：原生 GeoJsonDataSource 的显式平面加载

- Status: accepted
- Date: 2026-10-20
- Baseline: Cesium 1.144 / `6d5d8b1f0725b6f831b336463f4b11c98023427b`
- Related: ADR-0013、ADR-0016、ADR-0022；SGP-0062
- Plan: [planar-geojson](../../../AgentDocs/planar-geojson/plans/2026-10-20-native-loading.md)

## 决定

复用原生 `GeoJsonDataSource`，在 `LoadOptions` 增加可选 `planar`：

```js
const projection = new Cesium.WebMercatorProjection();
const source = await Cesium.GeoJsonDataSource.load(data, {
  planar: {
    world: viewer.scene.world,
    projectCoordinates(coordinates, crs) {
      if (crs !== undefined) {
        throw new Error(
          "This application expects WGS84 GeoJSON without a CRS override.",
        );
      }
      return projection.project(
        Cesium.Cartographic.fromDegrees(
          coordinates[0],
          coordinates[1],
          coordinates[2] ?? 0,
        ),
      );
    },
  },
  clampToGround: true,
});
await viewer.dataSources.add(source);
```

`projectCoordinates` 是必填的实例级转换；输入为原始坐标和根 CRS metadata，输出为目标 World
的有限米制 `Cartesian3`。加载器复制返回值，允许应用复用 scratch。没有隐式 CRS 推断、全局
`crsNames` 修改或 ECEF 往返转换。自定义 CRS 的解释与拒绝由显式 callback 负责；
`crs:null` 继续是 native no-op。TopoJSON 解码后的坐标使用相同 callback。

首次 load/process 确定坐标模式，planar context 绑定一个 live World 和一个 callback identity。
后续省略 planar 选项复用绑定；显式更换 world、callback 或从 globe 改成 planar 拒绝，
即使 load 会清空原数据也不把已附着的 visualizer 悄然变成另一坐标系。切换需新建 DataSource。
World 只被引用，不由 loader 拥有；请求完成时再次验证存活。仍沿用 native loader
非事务的实体生成与 loading/error 行为，不新增重试或异步完成回退。

线面使用 `ArcType.NONE`；2D polygon 在 `clampToGround:true` 时显式设置
`CLAMP_TO_GROUND`，其余高度规则沿用 native：2D 面缺省高度 0，带第三维的点/面保留绝对高度，
line 的 clamp 显式覆盖 source Z。不更改既有平面几何合法性、extent、渲染和 terrain request 规则。

## 集成与边界

- `GeoJsonDataSource.js` 是唯一上游修改，SGP-0062 记录最小 options/context、CRS 与 geometry
  semantics 缝隙；解析、样式、Entity、Resource、metadata、事件、show、credits 继续由 native 所有。
- 坐标与模式验证位于 SceneGIS-owned `_SceneGISPlanarGeoJson.js`；
  planar visualizer gate 接受 `CustomDataSource` 或绑定当前 World 的 `GeoJsonDataSource`。
- 未配置的 GeoJSON 仍为 Globe/ECEF；不可直接加入 Planar Viewer。Planar source 只供其绑定 World
  使用，不可加入 Globe Viewer。clustering 保持关闭要求。
- 不新增 public class、全局注册或默认 callback 修改；不改 native Globe 行为。
- 不承诺 IDL wrap、球面 geodesic/rhumb、跨 World 重用、嵌套 polygon holes、CZML/KML 或新合批路径。

## 验证与升级

运行 SceneGIS loader / gate Specs 和 native GeoJSON Specs；以本地真实 Viewer 检验渲染、
ground、拾取、holes、可见性、取景与 teardown。执行完整构建、release、声明和类型验证。
升级时核对 native preload 的 options 归一化、CRS 分派、type handlers 的 arc/height、process
追加语义及 DataSourceDisplay 的 gate/update 顺序；不复制上游解析器。
