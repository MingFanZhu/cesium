# 平面地形裁剪技术自审

- Type: implementation / architecture self-review
- Status: approved；技术自审与负责人视觉验收均通过
- Author / owner: 当前 Agent；未启用独立评审 Agent
- Created / Updated: 2026-09-18
- Target: `codex/planar-terrain-clipping` 中的裁剪实现
- Parent: [standalone plan](../plans/2026-09-18-terrain-clipping.md)
- Decision: [ADR-0081](../../../Documentation/SceneGIS/Decisions/ADR-0081-planar-terrain-clipping.md)
- Upstream-owned files / SGP: None

## 实现核对

负责人要求尽量保持 Cesium API 一致，因此没有新增公开裁剪类型。
World 两个同名属性直接接受原生 ClippingPlaneCollection / ClippingPolygonCollection，
后者直接包含原生 ClippingPolygon。集合增删、启停、modelMatrix、交并、inverse、edge style 均沿用原接口。
Polygon 只解释米制直线 XY 外环；球面 distance texture 的 quality/debug 参数不参与平面渲染。

集合独占所有权在销毁旧集合之前校验。Surface 独占一个惰性纹理，候选数据与最后发布的快照分离；
非法坐标、自交环、奇异矩阵和预算超限不会覆盖已发布裁剪数据。
Polygon 以首点重基，避免大 CRS 平移吞掉局部细节；plane equations 同步变换到同一基点。
动态数量使用 shader 循环，数据不变时不上传纹理，不按数量增长 shader variants。

三个 vertex variants 使用 tile-local 位置和 CPU 计算的基点差；fragment discard 在颜色和派生深度中保持。
TerrainQuery 对每个 triangle intersection 检查可见性，被裁近面不会提前终止后方命中。
原始 resident height、独立 sampler、terrain provider 与 Worker mesh 不变。

## 证据

| 风险                       | 验证                                                                                                                                                              | 结果                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 公共 API 与 GPU 裁剪       | 新增 SceneGISPlanarClipping Specs，原生集合、交并、变换、凹环、多区域、inverse、变更快照、大坐标、edge style、linear/log depth                                    | 12 项通过                                                   |
| 原有 Surface / World / ray | Surface 与 shader、World、TerrainQuery；ray 新增被裁近面后继续命中同 mesh 远面                                                                                    | 45 + 25 + 9 项通过                                          |
| 真实地形与用户操作         | 本地 RGB24 高程图 dev bundle、quantized-mesh release bundle；可见 ray / pickPosition、原始高度、独立采样、GUI 凹多边形                                            | 2 项 Chromium E2E 通过；截图已检查                          |
| 资源与热路径               | 每种真实数据 12 warm frames，纹理上传、shader/command、terrain GPU 计数稳定，动态顶点修改复用 shader，销毁纹理平衡                                                | 通过；同机 render 调用 0–1 ms，仅作参考                     |
| 发布                       | 完整 build / buildRelease / buildTs；root 与 engine TypeScript configs；实际 npm engine tarball 解包后的 runtime / GLSL / generated module 导入与公开类型、所有权 | 通过                                                        |
| 类型脚本环境               | 默认 npm 6 不支持 gulp tsc 所用 npm exec；直接使用 Node 24 执行本地 TypeScript 编译器，覆盖 gulp 同样的现存 configs                                               | root / engine 均通过；widgets 无 tsconfig，按 gulp 规则跳过 |

本项 ESLint、格式、Markdown、git diff --check 和上游审计通过；current delivery upstream-owned entries=0，
generated status=0。全 AgentDocs Markdown 通过，Prettier 报告 291 份既有无关文档格式问题，本项文档通过。
既有完整 package smoke 的精确公共导出白名单仍存在独立 VectorTile 缺项，本项没有重复运行或扩大修复范围；
本次实际 engine tarball 定向 smoke 已覆盖新增裁剪私有依赖、shader source/generated module、类型与原生集合生命周期。
package verifier 已登记这些路径和 World 两个属性的类型断言。

## Finding 与处置

没有未关闭的阻断 finding。实施中发现并修复了大坐标原点远离 polygon 时的小环精度问题，
新增 1e8 米偏移下 0.125 米边长的回归用例；非法候选恢复与快照保持已有自动化证据。
Specs 最初直接导入 ContextLimits 得到了第二份模块，未能模拟真实预算；已统一从生成 barrel 导入，
与仓库 Specs external-Cesium 构建入口保持一致，预算用例通过。

### PC-R001：共面裙边碎片（P1，fixed）

- Reporter: 项目负责人视觉复测；owner: 当前 Agent。
- 复现：heightmap，双平面并集沿 X=0 / Y=0 裁剪，多 polygon 使局部 origin 非零，低俯角观察。
  关闭 edgeWidth 后黄色碎点变成地形色，证明不是描边逻辑；完整剖切侧壁并未生成。
- 根因：裙边原本与裁剪面重合，Float32 varying 插值以及 dot/add 消减产生微小正负距离。
  `distance <= 0` 因片元而异，正侧残留又被边缘着色放大。
- 修复：根据运算项绝对值和 Float32 精度计算舍入边界，把数值共面点统一归入裁剪侧；
  CPU ray 使用相同公式，不新增几何、偏移面、资源、shader variant 或公共参数。
- 验证：新增真实 65x65 heightmap 裙边的 13x13 像素区域测试，修改前 79 个残留片元，修改后为 0；
  关闭裁剪仍可见原裙边，pickPosition 不残留深度，边界内外 CPU 判定正确。
  Clipping 当前 13 项全通过，包括既有热帧/销毁检查；原页面原相机与参数复测碎点消失。
- 本轮交付检查：build / buildRelease、两项真实地形 dev/release E2E、ESLint、相关格式与 Markdown 通过。
  热帧资源与纹理上传计数继续稳定，同机 render 调用 0–1 ms；全 AgentDocs Markdown 通过，
  Prettier 仍仅报告 291 份既有文档格式问题。公共签名未变，不重复类型构建或无关全量 Specs。

## 剩余范围与交接

需要 WebGL 2 与浮点纹理；片元成本随 plane / edge 数量增长，当前不承诺海量 polygon 性能。
不生成剖切侧壁和封底，不编辑地形源数据，不支持自交环。多边形边界附近仍受 GPU 浮点精度约束。
负责人已于 2026-09-18 从“地形剖切”页确认最终画面验收通过，PC-R001 的视觉复验关闭。
之前 metadata 与大气变更保持独立；未提交或 push。
