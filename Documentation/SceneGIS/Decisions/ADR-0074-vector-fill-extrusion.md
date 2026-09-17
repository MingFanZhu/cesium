# ADR-0074：独立矢量建筑拉伸

- Status: accepted; implementation and owner visual/interaction qualification passed on 2026-09-17
- Date: 2026-09-17
- Plan: [V3D1](../../../AgentDocs/vector-tiles/plans/2026-09-17-v3d1-fill-extrusion.md)
- Related: [ADR-0061](ADR-0061-owned-vector-tile-primitives.md)、[ADR-0067](ADR-0067-vector-worker-preparation.md)、[ADR-0070](ADR-0070-globe-vector-ground-rendering.md)
- SGP: None

## Decision

fill-extrusion 是实体几何，不消费地表 coverage shader。支持 polygon height/base/color/opacity/vertical-gradient、
已有表达式与 filter。底高和顶高为相对地形的米制距离，非负；height<=base 不生成体积。
color 的 alpha 按 Style 语义忽略，由 fill-extrusion-opacity 与 Layer.opacity 相乘决定透明度。
不支持的 pattern/translate/transition 等仍 fail fast；不承诺完整 MapLibre style light 或像素一致。

Worker 建立孔洞屋顶、外墙/内墙、法线及地形 anchor，沿用现有 transfer/budget/generation。
几何及 draw command 按 tile/style 合批，不新增逐 feature Primitive/Entity 或地图颜色 RTT。
MVT 仍 CRS 无关；Planar 固定 +Z 米制，Globe 使用 WGS84 geodetic up 与高低位 ECEF 相对原点。
瓦片裁切边不生成虚假墙，fragment 以真实几何插值 XY 使用原 resident cover 半开裁剪。

屋顶以每个 polygon 的外环中心查询既有 rendered terrain snapshot，整个 polygon 共享高程。
base=0 时底边向下延伸到较低的逐顶点地形，以覆盖坡面；base>0 保持与屋顶相同 anchor。
地形未就绪沿用现有 zero-height surface，resident terrain 更新仅更新位置 buffer，不重新三角化或请求 terrain。
Globe 的批量地形求交和 ECEF 编码使用现有 vector Worker 的 `extrusion-terrain` task。
每批次仅跟踪实际顶点包络相交的 mesh/index；无关地形变化和 cover 排序不触发重算。
相交索引未就绪时等待既有 terrain task；每批次至多一个任务、每帧至多提交一个建筑更新任务。
输入通过 structured clone 复制数据，禁止 transfer native terrain 或当前顶点流；输出 position streams transfer 返回。
主线程共用 tile 上传时间/字节预算，在 normal render 原子发布整批位置；异步完成本身不上传。
等待期间保留已发布位置，provider/本地地形依赖变化或销毁后的迟到结果必须丢弃；失败明确上报，不自动重试。
当前可见建筑的待准备/待上传状态参与 Layer.tilesLoaded。Planar 继续使用已有同步 grid 高程查询。
首次从无地形切换到 Planar ground 后端仍沿用既有批次重建；Globe provider 变更保持相同几何资源。
独立瓦片没有全局建筑拼接，服务裁切导致不同 anchor 的跨 tile 地形接缝是明确限制。

默认采用 Scene 光向、Lambert 与环境亮度，vertical-gradient 是可关闭的侧墙垂直渐变；
已有高级环境 active 时复用矢量物理光照 receiver，普通示例不新增高级环境。
Opaque 写真实几何深度；透明使用 Cesium TRANSLUCENT/OIT，与底图自身的制图层序分开。
Native derived pick/depth 使用同一几何/clip，Layer opacity=0 保留资源且不提交绘制。
不增加自定义 pass、第二套 WebGL Context 或上游渲染 hook。

## Delivery and validation

沿用 SceneGIS GLSL root 与既有 vector Worker entry；新增私有模块按现有 barrel/build 生成，不改上游。
验证 style、孔洞、侧墙 winding、height/base、tile boundaries、真实 Worker transfer、双世界渲染与 pick/depth、
terrain 更新、半透明和销毁，附有界命令/资源/帧时测量。Shader/Worker 验证实际 release/package 入口。
升级复核 Cesium ordinary pass/OIT、log-depth、derived pick 与资源生命周期。
