# Standalone Plan: Native planar GeoJSON loading

## Metadata

- Plan type: `standalone`
- Status: `completed`
- Parent plan / Phase: None
- Owner role: architecture and execution, current task
- Architecture review: `confirmed` by current task
- Created / Updated: `2026-10-20`
- Related discussions: None
- Related review: [Native loading](../reviews/2026-10-20-native-loading.md)
- ADR: [ADR-0172](../../../Documentation/SceneGIS/Decisions/ADR-0172-planar-geojson-loading.md)
- SGP: `SGP-0062`

## Objective and boundaries

原生 `GeoJsonDataSource` 在显式目标 World 与坐标转换下进入既有平面 Entity path。
单次可验证的 loader/gate 集成；不新建解析器、Entity 系统、投影库或渲染后端。

## Current source facts

- Native loader 的 type handlers 共用 `crsFunction`，已覆盖 GeoJSON / TopoJSON、multi、
  holes、simplestyle、properties、load/process、loading/error 和 Resource。
- Native 点转 ECEF；线面设 RHUMB；2D clamp polygon 依赖 Globe updater 隐式地表语义。
- Planar callback 只接受 CustomDataSource；已有 children 支持固定坐标、NONE 弧线和显式地表夹紧。
- 坐标系 CRS 为 opaque metadata，不能按字符串猜测运行时投影。
- `planar-content` 已完成且将格式适配明确划为独立扩展。

## Detailed design and affected paths

1. `GeoJsonDataSource.LoadOptions.planar = { world, projectCoordinates }`。
   callback 接受输入 coordinate 与根 CRS metadata，返回目标 World 的米制 Cartesian3。
2. SceneGIS-owned helper 验证并绑定实例 context；首次 load/process 确定 globe/planar 模式，
   后续省略选项继承绑定；拒绝更换 world、投影或模式，防止 process 混入其他坐标。
3. Native loader 只增加 context、CRS override、ArcType.NONE 与 2D ground polygon heightReference 缝隙。
   保留 native crs:null no-op、样式、显式 Z 和 native error/event 行为。
4. Planar gate 接受绑定同一 live World 的 GeoJsonDataSource；现有 CustomDataSource 不变。
5. 更新 Architecture、兼容性矩阵、Guide 和 upgrade checklist；新增本地确定性开发示例。

## Validation and completion

- Specs：原生根导入、坐标与 scratch 返回值快照、多几何/holes/style、3D altitude、ground、
  load/process 继承、非法模式/World/输出、失败事件和未配置 Globe 回归。
- GPU E2E：真实 Viewer，普通/地形夹紧线面与点，原 Entity pick、hole、隐藏、取景、移除/销毁；
  仅本地数据，不触碰用户现有页面。
- Native GeoJsonDataSource Specs、planar gate Specs；完整 build/release、声明及类型检查。
- Review 针对跨 World 混用、异步 load context、ownership、marker 和生成边界。
  最小充分证据后结束，不扩展为全库渲染资格工程。

## Deviations and results

- 已实现 planned native options/helper/gate，World 仅引用，不新增 renderer/Worker/逐帧投影。
- Native/SceneGIS GeoJSON 相关 Specs `92/92`（其中新增 11 项）、既有 planar gate `10/10`。
- 开发及压缩发布包的本地 E2E 各 `1/1`：六类普通/ground 图形、真实 GPU 原 Entity pick、
  hole、可见颜色变化、show、zoomTo、remove/destroy、零外网请求；静态帧不再调用投影。
- `npm run build`、完整 `npm run release`、根 `tsc --noEmit`、严格类型消费 fixture、
  scoped ESLint、upstream patch audit 通过。原有私有 doclet 类型生成告警仍存在，release exit 0。
- Chromium 默认 ANGLE 后端通过真实 WebGL。仓库 E2E 的 `--use-angle=gl` 在本机无法创建
  Context；仅验证用配置移除该启动参数，未修改产品或全库 E2E 配置。
- Specs 初次混用了 root runtime 和 source private helper，导致 instanceof 不同 identity；
  改为根入口的 soft-private helper 后通过，不修改产品以适配测试。
- 新示例画面已由当前任务检查；项目负责人视觉验收待其操作，不声称已获用户验收。
- 全库 AgentDocs markdownlint 通过；全库 Prettier 报告 495 个既有未修改文件，
  本扩展与本次改动文件单独检查通过，不顺带重排旧文档。
- 类型 fixture 命令：
  `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck packages/engine/Specs/SceneGIS/DataSources/SceneGISPlanarGeoJsonTypes.ts`。
