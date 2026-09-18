# 平面地形剖切与多边形裁剪

- Type: standalone plan
- Status: completed；技术验证与负责人视觉验收通过
- Created / Updated: 2026-09-18
- Owner / architecture review: 当前 Agent；confirmed
- Parent: [平面高级地形](2026-08-10-planar-terrain-advanced-extension.md)
- Decision: [ADR-0081](../../../Documentation/SceneGIS/Decisions/ADR-0081-planar-terrain-clipping.md)
- Branch: `codex/planar-terrain-clipping`
- Upstream-owned files / SGP: None planned

## 范围与事实

负责人明确选择平面剖切和多边形裁剪。当前 Cesium Globe 提供 clippingPlanes / clippingPolygons；
Planar World 的单 Pass.GLOBE surface、三种 vertex variant 与独立 terrain query 尚未消费裁剪状态。
球面 polygon 使用球面经纬度和 signed distance compute，不可直接解释私有米制 XY。

本项接续同一工作区的地形 metadata 接入；其代码和既有大气变更保持，不混入本项验收。
地形 metadata 的负责人视觉验收仍由其独立 plan 跟踪。本项一次实现、验证和交付，不拆分未核实的后续阶段。

## 设计与步骤

1. World 增加同名 clippingPlanes / clippingPolygons，直接复用 Cesium ClippingPlaneCollection、
   ClippingPolygonCollection 和 ClippingPolygon；遵照负责人要求保持 API 一致，仅使用平面 XY 坐标语义。
2. 集合交给 World 独占，替换或销毁释放集合。Surface 独占裁剪纹理和最近成功 normal render 的状态快照，
   pick/depth replay 不消费未发布的修改。
3. 使用单个 RGBA Float32 数据纹理表达 plane equations 与 polygon edges；只在数据变化时上传。
   一个开关变体复用所有数量与模式，动态数值和增删不增加 shader cache variants；默认无资源。
4. 平面使用 Hessian 负半空间、union/intersection、modelMatrix 和 edge style；多边形按直线 XY 外环，
   多环取并集，inverse 裁外。有限坐标、simple ring、affine matrix 和 Context 能力在发布前校验。
5. 同一 discard 作用于颜色与深度。CPU terrain ray query 对每个候选交点使用已发布快照，继续查找可见的后续交点。
   resident height 和独立采样保持源数据语义；不生成侧壁、封底或改变 provider。
6. 增加本地 Test 示例、Specs 和两种真实 terrain payload 的浏览器验证，覆盖变更、拾取、动态重放、
   大坐标偏移、资源稳定和销毁。完成 build/release/types 与相关 lint、上游审计及文档。

## 验收与风险

- 平面交/并、平移/旋转变换、启停与 edge style 的实际像素。
- 凹多边形、多区域、inverse、移除/更新及地形深度一致；无剪裁时默认画面保持。
- CPU ray 不返回已裁区域，不因最近交点被裁而漏掉后方可见面。
- 纹理上传、shader/VA/command 在稳定帧保持，集合替换和 World destroy 无残留。
- WebGL2 浮点纹理能力与 sampler 预算明确，静态裁剪成本随边数增长；不声称大规模 polygon 性能资格。
- 技术自审和负责人视觉验收分别记录，见 [review](../reviews/2026-09-18-terrain-clipping.md)。

## 实施交接

负责人视觉复测发现：heightmap 双平面并集恰好沿瓦片边界裁剪时，低角度出现向下散落的裙边碎点；
关闭 edgeWidth 后碎点仍在。已确认是共面裙边的 Float32 插值与 dot/add 误差改变距离符号，
GPU/CPU 现使用同一基于算式量级的舍入边界；新增真实 heightmap 裙边像素回归，旧实现 79 个残留片元，
修复后 0 个，派生深度也不再残留。原相机和双平面并集 / 多区域参数复测碎点消失。
API、地形 mesh/Worker 与资源所有权不变。Clipping Specs 当前 13 项通过；本轮 release / E2E 结果见 review。

已完成 World 原生 API、私有 CPU/GPU 裁剪快照、三种 VS 与同一 FS 的 discard、可见 ray query、
真实数据示例、Specs / E2E、公开指南与 ADR。没有新增公开裁剪类型；私有坐标语义是唯一几何接口差别。
Surface shared texture 使用 polygon 首点重基；新增大偏移小环回归用例。资源稳定帧不上传、不重编译。

- 相关 Specs：Clipping 当前 13、此前 Surface / Shader 45、World 25、TerrainQuery 9，累计 92 项通过。
- Chromium：高程图 dev 与 mesh release 两个 E2E 通过；GUI 凹多边形画面已检查。
- 完整 build / buildRelease / buildTs 通过，TypeScript root / engine 编译通过。
  系统默认 npm 6 不支持 npm exec，使用 Node 24 直接执行同一本地 TypeScript；widgets 无 tsconfig。
- npm engine 实际 tarball 定向 smoke 通过，覆盖新 runtime、GLSL / generated module、原生 API、declarations 和销毁。
  完整 package smoke 的既有 VectorTile 导出白名单问题保持独立，不在本项重复扩大验证。
- 本项 ESLint、格式与 Markdown 通过；全 AgentDocs Markdown 通过。
  全 AgentDocs Prettier 检查报告 291 份既有文件格式问题，未修改无关文档；本项文档格式通过。
  上游审计通过：current delivery upstream-owned entries=0，generated status=0；git diff --check 通过。
- 本项 upstream-owned files=0，SGP=None；未提交或 push。

负责人已于 2026-09-18 明确验收通过，包含共面裙边修复；本 standalone plan 关闭。
metadata 待验收项继续由原计划跟踪。下一项通用影像加载由 planar-world 扩展独立记录。
