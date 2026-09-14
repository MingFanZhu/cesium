# V3C1D：旋转期间的标注持续性与开销

- Type: `phase plan`
- Status: `completed`
- Author: 当前 Agent，architecture/execution 自审
- Architecture review: `confirmed`
- Updated: `2026-09-14`
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Predecessor: V4B checkpoint `723a2feed9`，负责人确认通过
- Related: ADR-0067、ADR-0068、ADR-0070；G1-R16、V4B-R06
- Review: [V3C1D 自审](../reviews/2026-09-14-v3c1d-symbol-orbit-review.md)
- SGP: None planned

## Evidence and scope

负责人反馈南京浅倾角绕中心水平转动时，POI 消失/重新出现与掉帧同步。现有页面为 Bright、
Globe ellipsoid、环境关闭，原视角约 11.37° 俯角、zoom 17.292，静止约 57 FPS。
360 帧 ±1.5 rad 绕视轴椭球交点的采样复现标注明显减少和长帧；字形请求
始终为 0，glyph atlas revision 不变，shaping revision 只增加一次。Worker 完成量主要是新地图瓦片。
不能将“标注完成后恢复帧数”直接解释为主线程重新解码字体。

源码与 profile 指向标注候选缓存仅保护 render cover，resident tile 短时退出 cover 后会重新构造
候选；布局逐候选遍历大量不可见 anchors，当前 owner 已失效的旧标注在新 cohort 提交前会消失。
诊断 statistics 还每帧遍历所有字形 bitmap 求和，shaping ready cache 每帧分配数组扫描等待任务。
这些开销与新 tile GPU promotion、已有 draw-call 成本须分别测量。

## Implementation and validation

1. 固定当前南京相机、viewport、渲染参数与轨迹；记录 CPU/frame、候选重建、cohort 延迟、
   owner 失效、Worker/资源活动，避免采样器自身逐帧调用昂贵的完整统计 getter。
2. 标注候选缓存与实际 resident entry 生命周期一致；cover 只决定可见/归属，不销毁可复用布局。
   依据剩余 profile 修正扫描/准备/发布热点，不以清空标注、限制旋转、降低字体质量或扩大 tile budget 掩盖问题。
3. 保持 ADR-0068 的碰撞语义、当前相机 draw/pick、软预算与资源 generation 约束；长期调度调整
   补入 ADR。MVT/字形解析继续使用既有 Worker，不引入额外 fallback 或渲染管线。
4. 增加确定性的缓存离开/返回、真实释放及布局持续性 Specs；相关 Planar/Globe 页面回归。
   只运行修改风险所需的构建与检查；若改变 Worker/Shader/公共协议，再补对应发布验证。
5. 原轨迹对照与用户视觉/交互验收后建立独立 checkpoint；其他 V4B-R06 GPU 重负载范围继续保留，
   不将本次修正描述为所有视角稳定 60 FPS。

## Current handoff

负责人在视觉验收中追加沿路文字的浅倾角尺寸问题。当前 5.05° 视角“中山南路”的样式字号仍为
13 px，anchor depth / reference depth 为 0.275，直接地面投影造成约 3.64 倍放大。
对照 MapLibre 5.24.0 symbol shader，缺少 map-pitch perspective compensation；这属于既有投影路径缺口，
不是本阶段空间索引改变字号。补充范围：map-pitched text/icon 按 anchor/reference depth 补偿地面尺寸，
geometry、沿线间距、collision 与 pick 共用；中心、俯视和正交保持，viewport 路径不扩展。
新增近/中/远、低俯角与资源复用 Specs，原南京页面对照及相关 E2E；保留当前 phase，不提前关闭视觉 gate。
该补充已完成：同一近景道路名称投影包围盒宽 201.37→128.26 px，中心/字号不变；29 项 symbol Specs、
2 项相关页面 E2E 通过。补偿后 5.05° 原视角小范围旋转帧间隔 P50/P95 为 19.1/33.6 ms，
公共数据与缓存条件不构成严格 A/B；完整证据、历史指标边界和最终技术自审见 review。

之前的调度优化已实施 resident candidate cache、预算内空间索引、ready shaping cache 与待处理队列分离、
加载时字形字节统计；长期边界补入 ADR-0068。没有修改 Worker/Shader/公共协议/上游文件。
最终同轨迹轻量采样的运动帧间隔 P95 为 60.4→36.9 ms，最长 cohort 920.4→346.3 ms，
候选重建 148038→63799；Worker 完成任务和 tile uploads 数量相近，公共数据/cache 差异见 review。
恢复原视角仍为 306 placed / 1179 candidates、49 tiles、1828 commands，无资源错误。
28 项 symbol Specs 和 4 项相关 Globe/Planar/沿线页面 E2E 通过；147 项其他 vector Specs 已通过。
新增缓存测试初次未达到 SSE 细分阈值，修正 near-camera fixture 后通过，未为测试改变产品分支。
Engine/root build、修改范围 ESLint/Prettier 和文档/所有权审计见 review。
技术自审通过。负责人认可当前功能并要求转向简单上手示例，按推进授权关闭视觉与交互 gate；
本阶段形成独立 checkpoint 后再开展示例整理。
新 tile GPU promotion 和约 1800 draw calls 的开销仍在，不将本次结果描述为稳定 60 FPS。
可复现相机与轨迹参数保存在 Test；原始 profile 与逐帧测量只保存在忽略的 Build/Specs。
