# V3D1 建筑拉伸自审

- Date: 2026-09-17
- Reviewer: 当前 Agent，architecture/execution 自审，并非独立评审
- Plan: [V3D1](../plans/2026-09-17-v3d1-fill-extrusion.md)
- Decision: approved；技术自审通过，负责人于 2026-09-17 确认贴地交互验收通过并授权收口
- Predecessor: E2 `cae5a711bf`
- Upstream-owned files: None；基线 `6d5d8b1f0725b6f831b336463f4b11c98023427b` 路径交集为空
- SGP: None

## 实现与复核

支持 fill-extrusion-height/base/color/opacity/vertical-gradient、既有表达式和 filter。
Core 在 vector Worker 中三角化孔洞屋顶、生成墙面、合批、编码位置；Globe 同时转换 ECEF 位置和法线。
Renderer 使用自有 VA/Shader，按 tile/style 合批，沿用预算、代际丢弃和 native derived pick/depth。
Opaque 写实体深度，透明交给普通 TRANSLUCENT/OIT；现有地表 coverage 路径保持独立。

每 polygon 外环顶点均值作为 terrain anchor，底高为零时底边向较低地形延伸，正底高保持统一基准。
只查询已渲染地形；resident revision 更新位置 buffer，固定视图与 Layer.opacity 变化保留 VA/program。
Planar 首次 flat/ground 切换仍沿用既有批次重建；Globe 更换 terrainProvider 保留楼栋资源。
拆片不增加虚假切片边墙，resident cover 使用插值几何 XY 半开裁剪。

Bright 在两个中文上手示例和两个测试入口替换 building 为 extrusion；Liberty 直接启用 building-3d，
支持层数从 107/111 增至 108/111。示例保持默认 lil-gui 样式，无新增高级环境或复杂控制。
平面用显式 +Z-up 方向光，Globe 使用 Scene 原生光向。

## 验证证据

- ChromeHeadless engine workspace：191 项 vector Specs 全通过，包括新增 7 项几何、Worker 和双世界 WebGL 检查。
  屋顶面积/孔洞、侧墙 winding、米制高度/底高、瓦片裁切边、颜色 alpha 语义、真实 Worker transfer、
  屋顶像素/native pick/pickPosition、透明、真实地形抬升、暖资源及销毁均通过。
  命令为 `gulp build --workspace @cesium/engine` 后
  `gulp test --workspace @cesium/engine --production --browsers ChromeHeadless --includeName SceneGISVector --failTaskOnError`。
- 3 项中文示例 E2E 通过：真实 Worker 楼栋批次、高度 10 米、GUI 透明度、错误反馈与释放。
- 补充运行 6 项 environment Specs 全通过，其中新增 Planar/Globe extrusion 两项验证高级环境材质、
  云影响应、HDR 开关、native pick、几何保留和借用纹理释放边界；因此本阶段共 193 个独立 vector Specs 已通过。
- 3 项原测试页相关 E2E 通过：地形切换、倾斜/pick/资源重建、Bright/Liberty 切换与服务失败。
- `buildRelease`、`buildTs`、`tsc` 通过。类型生成保留已有 Cesium JSDoc 警告，无新增公共 API。
- 实际 npm pack/install、release ESM、release IIFE 三入口通过；均通过 Worker 准备真实 extrusion、
  屋顶像素/pick/VA 释放检查，并保持原 glyph、ground、透明地表和 environment qualification。
- 在线 Berlin 双世界已检查可见屋顶、侧墙、院落。当前视角原生 FPS 显示 Globe 59 FPS、Planar 60 FPS；
  这是本机静止画面观察，不代表近地平线移动或所有数据规模的帧率保证。
- 产物与日志仅存 `Build/Specs/vector-extrusion-*`，不提交生成的 Shader JS、bundle、声明或截图。
- ESLint、Prettier、Markdownlint 和基线所有权检查通过；没有改动上游文件或新增 SGP。

## 边界与 gate

| ID       | 状态     | 事项                                                                                               |
| -------- | -------- | -------------------------------------------------------------------------------------------------- |
| V3D1-R01 | accepted | 不做跨 tile 语义楼栋拼接；真实地形上的分片 anchor 可能产生接缝。                                   |
| V3D1-R02 | accepted | 不含复杂屋顶、pattern、translate、transition、style light、建筑投射阴影；未知 style 属性明确拒绝。 |
| V3D1-R03 | accepted | 大跨度曲面结构、复杂透明交叠、地下/背面与近地平线重负载未扩展资格。                                |
| V3D1-R04 | accepted | 负责人接受建筑与光照能力；后续性能反馈及暂停收口见下文 R05/R06。                                   |

楼栋受普通三维深度约束，会遮挡后方地面注记；不承诺 MapLibre 的像素一致。
本阶段未改变 existing source cover/terrain loading，也未引入逐 feature Entity/Primitive 或地图颜色 RTT。

## 收口前性能修正

负责人已接受上述建筑与光照能力边界，但在提交前报告真实地形开启后的卡顿，因此暂停阶段收口。
北京 Bright、Esri 地形、约 14 级、45° 倾斜、相机到中心距离 4616.94 m，连续 240 帧每帧水平旋转 0.003 rad。
同一 Windows / Chromium 内嵌浏览器、同一画布与相机轨迹，使用 preUpdate/postRender CPU 计时及 CDP Profiler。
修改前 10 次地形快照变化触发整批楼栋主线程 BVH 求交和顶点编码，CPU median/P95/max 为 10.5/76.4/964.8 ms。

修正为 Globe 本地 mesh/index 依赖失效、现有 Worker 求交和编码、去重高程查询、有预算原子上传。
主线程只发布结果；provider/销毁代际丢弃、失败显式上报、readiness 和默认椭球快路径保持。
修改后相同轨迹同样 10 次地形变化，CPU median/P95/max 为 11.0/15.6/19.5 ms；
浏览器帧间隔 median/P95/max 为 16.7/27.2/50.1 ms，仍包含网络、调度及 GPU/合成影响，不承诺所有移动稳定 60 FPS。
测量前后均检查楼栋 applied、无失败和实际画面，静止约 59–60 FPS；公网数据/缓存不完全一致，不将该单机结果作为硬性能阈值。

新回归涵盖真实 Worker 高程与 borrowed buffer、无关地形/排序不失效、上传预算、旧 provider/销毁结果隔离、失败不重试。
最终完整 vector Specs 198 项通过，包含双世界地形高度、屋顶/pick/VA 与既有 Globe terrain queries。
首次页面资格发现 extent getter 不可 structured clone，已改为纯数值传输并由实际 Globe WebGL 回归验证。
完整 build/buildRelease 通过；installed engine、release ESM、release IIFE 的新 Worker task 均通过，
构造地形 600 m 加建筑 40 m，三入口返回楼顶高程 639.997 m（网格曲面误差在 2 m 容差内），保留既有图形/透明/环境/销毁检查。
离线 Globe E2E 通过，保留原透明地表与标注视图，另在街道细节视图确认建筑异步贴地已发布且无错误，最终释放 Worker。
初次 E2E 在并行构建期间未初始化；后续测试用例先把标注视图缩放到建筑层级，导致原标注样本离开视域，
最终将两种验收视图明确分开；未为这些测试调整产品逻辑或增加 retry。
ESLint、改动文件 Prettier、全 AgentDocs Markdownlint 与 diff/所有权审计通过；
全 AgentDocs Prettier 仍报告既有 233 文件格式告警，不扩散格式修改。
所有改动仍为 SceneGIS-owned，无新增 SGP；产物与日志仅保留 `Build/Specs/vector-ground-fix-*`。

| ID       | 状态     | 负责人     | 事项与下一步                                                           |
| -------- | -------- | ---------- | ---------------------------------------------------------------------- |
| V3D1-R04 | accepted | 项目负责人 | 建筑与光照能力已接受；原始视觉 gate 不代表本次性能修正已验收。         |
| V3D1-R05 | fixed    | 当前 Agent | 建筑贴地主线程长任务已消除，证据见上述 Specs 与同轨迹 profile。        |
| V3D1-R06 | closed   | 项目负责人 | 2026-09-17 明确验收通过，关闭贴地交互 gate，恢复本地提交与大阶段收口。 |

## 最终验收

V3D1 技术与人工 gate 均已关闭，R01–R03 为已接受的能力边界，不改写为已实现。
建筑使用自有 extrusion Shader，不走 ModelFS；普通光照及高级环境共享照明接入已验证，
不承诺完整 Model PBR、建筑投射阴影或透明多层建筑的大气合成视觉资格。
本阶段代码、Specs、ADR 与[大阶段收口记录](2026-09-17-milestone-closeout-review.md)形成同一本地 checkpoint。
