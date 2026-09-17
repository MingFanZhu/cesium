# G1 Globe 实现自审

- Type: `review`
- Status: `completed — technical review and owner visual/performance gate passed`
- Author/Owner: 当前 Agent，architecture/execution 自审，非独立评审
- Updated: `2026-09-14`
- Target: [G1](../plans/2026-09-14-g1-globe.md)，基于 V4A checkpoint `a961ff4ccb`
- Decision: [ADR-0070](../../../Documentation/SceneGIS/Decisions/ADR-0070-globe-vector-ground-rendering.md)
- Upstream-owned changes: None；SGP: None

## Findings and disposition

| ID     | Severity | Finding / evidence                                                                                                                                                                | Status / owner / follow-up                                           |
| ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| G1-R01 | High     | Globe 地形 matrix 与 EPSG:3857 source 不同，直接复用会解释错误 XYZ。Layer 独立验证 source scheme 与 World profile，自动化拒绝 geographic matrix、透明 Globe 和非 SCENE3D。        | fixed；当前 Agent；10 项 Globe Specs                                 |
| G1-R02 | High     | 平面凸体与 Z=0 逆投影不适用于球面。Worker 细分曲面覆盖、local ENU、高低位 origin，深度恢复 geodetic/Mercator。大陆尺度、高纬度、日期线、孔洞、透明层序、多 frustum 与 pick 实测。 | fixed；当前 Agent；Globe WebGL Specs、整球与山地页面                 |
| G1-R03 | High     | GPU 极小角 sine intrinsic 导致中心细线偏移。用 Cesium depth pick 对照后，局部小角多项式恢复精度；保留 8 px 原始失败用例，未扩大线宽或放宽颜色断言。                               | fixed；当前 Agent；75°N / 60°S、±180°回归；临时诊断 Shader 已移除    |
| G1-R04 | High     | 全局深度包络用于 SSE 会把远处列柱判作近景。选层使用已发布地表范围，绘制保持独立保守 bounds；视轴越过地平线仍保留有界 mixed cover。                                                | fixed；当前 Agent；32 tile mixed LOD / 整球远景 Specs                |
| G1-R05 | High     | 地形量化边越出理想 rectangle，锚点可能留在零高程并被地形遮挡。候选范围按编码 cell 扩张，遍历相邻拥有者，最终 BVH 精确求交。                                                       | fixed；当前 Agent；600 m 原生地形、圆点颜色/pick/provider 切换回归   |
| G1-R06 | High     | Native fill mesh 可无 encoding height extrema，直接 min/max 产生 NaN 并停止 Globe 渲染。按原生可选契约读取 mesh extrema。                                                         | fixed；当前 Agent；占位 mesh Specs 与 Esri 山地切换                  |
| G1-R07 | Medium   | 首次 TerrainPicker 全表扫描不适于逐注记调用。复制 surface-only mesh 至现有 Worker 构建 BVH；主线程查询，provider/mesh revision 与销毁隔离。                                       | fixed；当前 Agent；异步圆点、页面标注、三种实际包入口与释放检查      |
| G1-R08 | Medium   | 原有平面 E2E 恒高 fixture 把 tile width 作为 geometric error，产生 775 块无必要地形并不就绪。该精确平面误差改为 0，保留原始 layer/Worker、height、pick 与清理断言。               | fixed；当前 Agent；隔离回归 7.1 s 通过，不修改产品阈值               |
| G1-R09 | Medium   | 公共全球字体可能缺少特定字符；OpenFreeMap `Noto Sans Italic` 的部分加拿大原住民字符缺失，按既有失败语义报告。                                                                     | open；数据/字体后续工作；本地 fixture 不依赖外网，不宣称全球字库完整 |
| G1-R10 | Medium   | 起伏地形的 LOD/索引异步就绪会重做 anchor placement；大字形跨陡坡不等同于连续曲面文字。CPU、GPU 与字体密度仍有后续优化空间。                                                       | deferred；后继 V4/V5C/M1；继承 V4A 未完成质量边界，不以本阶段覆盖    |
| G1-R11 | Gate     | 负责人需检查 Globe 整球、城市和山地的实际画面。                                                                                                                                   | closed；负责人于 2026-09-14 确认性能修正可接受；形成 G1 checkpoint   |

## Initial implementation verification

- 166 项 vector Specs 通过；最终 G1 修改后 10 项 Globe Specs 通过，包括普通不透明 3D 物体遮挡。
- 13 项页面 E2E 均取得通过证据：首轮 12 项通过，恒高 fixture 修正后原有平面 terrain 1 项单独通过。
  新增 Globe E2E 阻断所有外网，覆盖 local MVT、文字/图标、起伏地形、provider/整球切换和释放。
- Engine/root build、buildTs、tsc、release build 通过；既有 TSD-JSDoc warnings 保留。
- 实际 installed-engine、release-esm、release-iife：Worker transferable 解码、glyph、平面 ground、
  Globe native terrain + circle、derived pick 与 GPU 释放通过；最终记录在本机忽略目录，不提交产物。
- 在线 OpenFreeMap Bright：柏林近景与整球、阿尔卑斯 Esri 地形已观察；Globe 原生地表保留。
- 修改范围 Prettier/ESLint、全部 AgentDocs Markdownlint、上游 diff 审计通过。
  全 AgentDocs Prettier 检查仍有 233 个既有文件格式告警；本次修改文件检查通过，未扩大格式修改范围。

## Runtime boundary

### Initial performance evidence

当前机器的 in-app browser，1432×1150、pixelRatio 1，OpenFreeMap Bright / Alps、原生 Esri
地形、45°倾角、zoom 11.95。静态就绪后 21 visible / 24 resident tiles、472 commands、
92 placed / 145 candidates、0 failed tiles / symbol failures。

- 60 帧 CPU submission median/P95：静态 3.6/5.1 ms；绕目标旋转 0.35 rad 为 7.7/15.5 ms。
- 旋转 60 帧的 frame interval median/P95：44.6/51.5 ms，中位约 22 FPS；未达到 60 FPS。
- 同视角隐藏 vector layer、保留 native terrain：CPU 0.6/1.1 ms，frame interval 16.7/45.5 ms。
- 该对照说明 vector 绘制仍有明显成本；CPU submission 不包含 GPU 完成和浏览器合成，
  不能仅以这组差值断言具体 Shader/overdraw 占比。下一次性能工作需以 GPU 计时和覆盖量定位，
  当前 Agent 负责跟进 G1-R10 / 后继 M1，不把功能通过解释为性能达标。

### Performance correction verification (2026-09-14)

负责人要求继续修复当前 Globe 倾斜视角。当前 Agent 自审，仍在 G1 内，没有关闭负责人视觉 gate。

| Finding                                         | Evidence / fix                                                                                                                                                                                                                     | Disposition                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| G1-R12：遮挡判断误留大量背面瓦片                | 原相机约 1.24 km 高、7.83°俯角，提交约 242 万个覆盖体实例；宽瓦片球体远高于地表。改用按地理高度包络计算的 ellipsoidal horizon point，实例降至约 120 万；原生射线可见地平线瓦片仍保留。                                             | fixed；新增 occlusion/ray-visible Specs，不限制相机或俯视拉远                        |
| G1-R13：重复 vertex、VA、纹理绑定与派生命令失效 | Globe box 36 次重复顶点改为 8 个角点/36 indices；同 layer 引用计数共享 VA，固定数值表合并。原先每帧 shallowClone 强制 dirty，现只在 source 改变时 clone，Shader 切换通过原生 setter 更新。                                         | fixed；169 项 vector Specs，包含 clone 次数、共享/最终释放和 native pick             |
| G1-R14：固定 fractional zoom 抖动               | 相同目标绕转 30 帧产生 30 个不同 mpp，差异约 1e-12，相应几何与样式 cache 每帧失效。统一 1e-10 zoom 精度；真实缩放变化仍生效。                                                                                                      | fixed；fractional orbit + real zoom Specs                                            |
| G1-R15：真实 terrain 的逐片元纹理读取与反算     | Alps GPU 44.7 ms / CPU 7.2 ms。专用 terrain Shader 使用 flat 三角形参数，保留默认椭球少 varying 路径；provider 来回切换复用 GPU geometry/pick。已有误差界用于保守早剔除；Newton 最多四步，在 1 mm 且 1/1000 参考像素内收敛才停止。 | fixed；真实 600 m 地形下数据驱动颜色、孔洞、8 px 线、pick 与双向 provider 切换 Specs |
| G1-R16：交互帧时仍有尾部波动                    | 原视角持续旋转/平移 P95 约 22.6 ms；地形旋转 P95 25.6 ms。尚不承诺所有动作每帧稳定 60 FPS，后续重点为动态 placement、新 tile 提交和 draw-call 成本。                                                                               | open；当前 Agent；后继 M1；不把单机 median 达标等同于尾延迟解决                      |

RTX 3060 Ti、Windows/Chrome 152 in-app browser，1432×1150、pixelRatio 1，Bright 公开数据。
原相机存于 [Test fixture](../../../Test/vector-tiles/globe-performance-camera.json)。GPU 使用
`EXT_disjoint_timer_query_webgl2`，preRender/postRender 区间 30 次 query、确认非 disjoint 后读结果；
CPU 同一区间，frame interval 独立统计。测量期间不并行运行 GPU Specs/E2E，不关闭地表或降低分辨率。

| Case                                       | CPU median/P95 ms | GPU median/P95 ms | Frame interval median/P95 ms |
| ------------------------------------------ | ----------------- | ----------------- | ---------------------------- |
| 原视角，修复前静止                         | 14.3 / 16.6       | 34.2 / 34.7       | 34.4 / 36.0                  |
| 原视角，修复后静止                         | 11.1 / 12.8       | 15.3 / 15.7       | 16.6 / 16.8                  |
| 原视角，绕视轴椭球交点旋转 0.2 rad / 30 帧 | 16.0 / 20.2       | 15.3 / 16.4       | 17.1 / 22.6                  |
| 原视角，rotateRight 0.00001 rad / 帧       | 16.2 / 21.2       | 15.2 / 16.7       | 17.3 / 22.6                  |
| Alps terrain，修复前静止                   | 7.2 / 15.5        | 44.7 / 45.7       | 45.3 / 49.5                  |
| Alps terrain，修复后静止                   | 4.4 / 10.4        | 17.3 / 18.0       | 17.5 / 18.6                  |
| Alps terrain，旋转 0.2 rad / 30 帧         | 6.2 / 10.3        | 17.2 / 18.0       | 16.8 / 25.6                  |

原视角 visible tiles 从 63 改为 55，回收误留的遮挡瓦片预算后近景重新选层，commands 从 1812 改为
约 1901；不能以减低地图质量解释收益。Alps 469 commands、92 placed / 145 candidates。临时隔离过滤器、
Profiler 和相机移动回调均已移除；最终恢复负责人原相机与地形关闭状态。

169 项 vector Specs、2 项相关页面 E2E（Globe 离线及平面真实地形切换）、build/release、tsc 已通过。
实际 installed-engine、release-esm、release-iife 的 Worker transfer、Globe 颜色/pick 与最终释放通过。
修改范围 Prettier、ESLint、Markdownlint，全部 AgentDocs Markdownlint 与 diff whitespace 检查通过。
全部 AgentDocs Prettier 仍报告 233 个既有文件格式告警，本次未修改这些文件。
按官方基线 tree 审计当前全部 38 个修改/新增路径，无 upstream-owned 修改，无 SGP。
全模式增加大量 varying、Worker bbox 预计算和以未赋值颜色诊断字段跳过绘制的实验均撤回。

### Supported profile

只资格 WGS84、不透明 Globe、SCENE3D；不包括透明地球、morph/2D、非 WGS84、地下相机、
高级环境完整材质融合、全球字体完整性、source LOD 无缝或连续曲面大字形。不承诺稳定 60 FPS。
使用原生 Globe/terrain 和自动 pick 派生，自有 MVT、地图 GPU 批次与 Worker；没有地图颜色 RTT。

## Owner acceptance and environment boundary

负责人于 2026-09-14 确认当前性能已可接受，G1 技术与视觉/交互 gate 关闭。本地提交包含本阶段实现、
Specs、ADR 与协作记录；没有激活下一阶段，R09/R10/R16 的剩余范围继续保留。

负责人随后询问 hillshade、大气与阴影。源码复核：ground 从实际 surface depth 求 geometric normal，
以 `0.4 + 0.6 * max(N·L, 0)` 调制地图色；仅借用 light direction，未读取物理 Sun/sky/Beer record。
Vector commands 明确不 cast/receive native geometry shadows，Globe background 也独立计算同一基础光照。
原生地表先画，矢量后画，所以不透明矢量会覆盖原生地表的已照明/阴影颜色；深度共享不会传递光照。
高级 HDR 大气在场景颜色完成后合成，顺序可复用，但 vector 材质/阴影未获得集成资格。

该边界由后继 V4/M1 负责，进入实现前需审计现有物理光照 receiver 与 shadow 派生，不能直接给覆盖
凸体开启 castShadows。当前正式能力说明见 [VectorTiles](../../../Documentation/SceneGIS/VectorTiles.md#地形明暗hillshade-与高级环境)。

## 2026-09-17 收口处置

负责人验收当前大阶段后，G1-R09 和 G1-R16 从 open 转为 deferred，G1-R10 保持 deferred。
公共字体覆盖、连续曲面字形与所有动作的帧时尾部不属于当前已接受 profile，未标记为修复。
负责人角色为 architecture；后续重新激活字体/地形标注或性能阶段时处理，统一跟踪见
[大阶段收口评审](2026-09-17-milestone-closeout-review.md)。此前量测与资格证据保持不变。
