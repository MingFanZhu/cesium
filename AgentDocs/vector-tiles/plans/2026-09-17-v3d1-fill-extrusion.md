# V3D1：建筑拉伸

- Type: phase plan
- Status: completed
- Owner / review: 当前 Agent，architecture/execution 自审
- Updated: 2026-09-17
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Predecessor: E2 checkpoint `cae5a711bf`
- ADR: [ADR-0074](../../../Documentation/SceneGIS/Decisions/ADR-0074-vector-fill-extrusion.md)
- SGP: None

## 进入阶段时的源码事实与范围

Style profile 尚未接受 fill-extrusion；Geometry.build 的非 fill/line 分支为 circle。
现有 Worker 负责 style/filter、三角化、合批与 high/low 编码；Renderer owns VA/program/pick。
地表绘制使用 TERRAIN_CLASSIFICATION、depthMask=false，不能作为实体建筑路径。
MapLibre 5.24.0 FillExtrusionBucket 使用屋顶三角化、独立侧墙、瓦片边界排除与 polygon terrain anchor。

本阶段实现 polygon fill-extrusion-height/base/color/opacity/vertical-gradient、表达式与 filter；
屋顶、外墙、孔洞内墙，自有批量几何与 Cesium native depth/pick。高度是米；平面固定 +Z，Globe geodetic up。
不扩展 pattern、translate、transition、style light 或任意屋顶形状，未知属性仍明确拒绝。

## Implementation

1. Core profile、Worker 几何与 Globe ECEF/normal 转换；不在主线程三角化。
2. 自有 extrusion Shader、普通 OPAQUE/TRANSLUCENT 命令、bounds、当前覆盖区域裁剪；保留 native derived pick/depth。
3. 复用 resident terrain snapshot，polygon anchor 统一抬升屋顶；地面底边按实际顶点高程向下延伸，正 base 保持统一底高。
4. 两个简单示例将 building fill 替换为 extrusion，保留 lil-gui 默认样式；测试数据和验收入口放 Test。
5. Style/Core/真实 Worker、双世界 WebGL、孔洞/高度/透明/遮挡/地形/销毁回归；验证构建、类型和实际 package Worker/Shader。

## Gate and risks

保持既有二维地图路径与源请求/LOD 协议。跨瓦片被服务裁切的同栋建筑可能有不同 terrain anchor；
不拼接跨 tile 语义楼栋。大跨度建筑、复杂透明交叠和近地平线负载保留显式边界。
技术证据回填 review，负责人实际画面验收后独立 checkpoint。

## 实施记录

2026-09-17 已完成 Worker 几何、自有实体 Shader、双世界地形 anchor 与示例接入。
191 项 vector Specs、6 项相关 E2E、完整构建/类型/三种实际发布入口验证通过。
随后新增双世界 extrusion 高级环境资格，6 项 environment Specs 通过，共 193 个独立 vector Specs 已通过。
平面示例补充固定坐标 DirectionalLight；Liberty building-3d 直接启用。
地形切换的资源边界与未资格范围见 [自审](../reviews/2026-09-17-v3d1-fill-extrusion-review.md)。
当时负责人视觉 gate pending；最终验收与 checkpoint 处置见下文。

## 收口前贴地性能修正

负责人接受建筑能力边界后，在提交前报告开启真实地形的性能问题，暂停收口。
2026-09-17 北京 Bright 倾斜旋转 240 帧：CPU P95 76.4 ms、最大 964.8 ms；
Profiler 热点为主线程 updateExtrusionAnchors 和 terrain BVH 求交。
全局地形快照变化使所有楼栋重复执行求高程和 ECEF 编码，违背重准备工作异步化的目标。

本阶段内修正：Globe 建筑按实际坐标包络选择 resident terrain dependencies，只有本地依赖变化才更新；
求交、去重与编码移入现有 vector Worker，主线程按原上传预算发布 position streams。
每批次至多一个任务，跨帧只保留最新待准备状态；未完成时保留已发布几何，旧代际结果不可覆盖新地形。
不新增地形请求，不修改地表 coverage、相机、画质或上游代码；Planar 既有同步 grid 查询保持。
验证真实 Worker、同区域/无关区域 invalidation、provider/销毁迟到隔离、readiness、屋顶/pick/VA 生命周期，
复测同一倾斜旋转并检查公开页面。修复验收前不提交或关闭本阶段。

技术结果：198 项 vector Specs、1 项离线 Globe E2E、完整 build/buildRelease 与三个实际包入口均通过。
同一北京 240 帧倾斜旋转 CPU median/P95/max 由 10.5/76.4/964.8 ms 变为 11.0/15.6/19.5 ms；
楼栋全部正确发布、无资源错误、静止约 59–60 FPS。剩余短时加载/GPU/合成波动不作为跨设备 60 FPS 保证。
2026-09-17 负责人明确“验收通过，收口当前矢量切片加载大阶段”，V3D1-R06 关闭。
阶段实现、技术自审和人工交互 gate 均通过，与收口记录形成独立本地 checkpoint；不激活下一阶段。
能力边界和延期事项见[大阶段收口评审](../reviews/2026-09-17-milestone-closeout-review.md)。
