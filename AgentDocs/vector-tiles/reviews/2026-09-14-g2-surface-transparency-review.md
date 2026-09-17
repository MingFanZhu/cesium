# G2：独立透明度与透明地球自审

- Type: `review`
- Status: `completed — owner progression accepted`
- Author: 当前 Agent，architecture/execution 自审，非独立评审
- Updated: `2026-09-14`
- Target: [G2 plan](../plans/2026-09-14-g2-surface-transparency.md)
- ADR: [ADR-0072](../../../Documentation/SceneGIS/Decisions/ADR-0072-vector-surface-transparency.md)
- SGP: `SGP-0012`

## Findings and disposition

| ID     | Severity | Finding / evidence                                                                                                                                                                                                                               | Owner / disposition                                                               |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| G2-R01 | high     | 原 guard 拒绝透明 Globe；直接删除会把地图颜色并入 native classification texture，再乘 Globe alpha。现在通过显式 owner slot 借用 first peel，Globe 颜色后直接画 vector；多 frustum/log-depth 下 alpha 0/.5/1、feature pick 的 WebGL pixels 通过。 | 当前 Agent / fixed                                                                |
| G2-R02 | high     | 晚于所有对象画地图会覆盖前景。采用 surface 阶段合成并移出已执行的 Globe translucent/pick commands；上方 opaque 与 translucent Box 保持原颜色与 pick，20 项 native transparency Specs 保持。                                                      | 当前 Agent / fixed                                                                |
| G2-R03 | medium   | Layer opacity 使用共享 uniform，覆盖背景、点线面、文字和图标；0 不提交命令。有限值检查、样式 alpha 相乘、文字 pick、数据/command/VA/program 保留及多 Layer 注销由 Specs 验证。没有新增地图颜色 RTT 或 GPU 资源。                                 | 当前 Agent / fixed                                                                |
| G2-R04 | medium   | 自动化真实地形切换会改变 native cover、LOD 和异步布局，不保证整个动态 command array 一直相等。此类 identity 断言移到固定椭球/固定 source 的 Spec；页面保留实际像素、标注、Worker ownership、provider/view/recreate/lifecycle 验证。              | 当前 Agent / fixed                                                                |
| G2-R05 | medium   | 页面新增三项透明度、真实地形及 60 帧测量后原 90 秒总预算在最后视图恢复耗尽，无 render error。扩展后的有界测试使用 150 秒，完整流程通过；不是产品 retry/fallback。                                                                                | 当前 Agent / fixed                                                                |
| G2-R06 | medium   | 首轮只资格确认当前可见面和其上方普通对象。背面/地下、穿越透明地表排序、高级环境透明深度合成、整个 Planar World 透明未交付；原生 imagery alpha 与双世界 vector opacity 已支持。                                                                   | 当前 Agent / deferred，后继 surface qualification；不关闭历史 V3C1D-R05 / V4B-R06 |
| G2-R07 | medium   | 透明模式首次切换仍有 native Globe shader/terrain warm-up；自动化 headless GPU 帧时不能代表应用帧数。实际 in-app 本地真实地形倾斜、surface alpha 0、vector alpha 1 已就绪时可见约 55 FPS，未宣称所有设备稳定 60 FPS。                             | 当前 Agent / accepted diagnostic limit，负责人视觉 gate pending                   |

## Verification

- 最新 engine/root 完整 build、buildTs、tsc、buildRelease 通过。
- 181 项 `SceneGISVector` Specs 和 20 项 `GlobeTranslucency` Specs 通过。
  新增独立 alpha、多 owner/imagery、foreground translucent/opaque pixel 与生命周期测试，既有环境资格保持。
- 6 项 planar public E2E、1 项扩展后的 Globe E2E 通过，实际使用本地 terrain/MVT/font/sprite。
  Globe 覆盖全透明地表、半透明矢量+影像、标注、原生操作/重建、远近视图和 BFCache/destroy。
- Installed engine、release ESM/IIFE 三种实际交付路径通过：真实地形上 circle/fill 的独立 alpha 为 `[128,0,64,255]`，
  pick 为 `point`，相关纹理销毁通过。类型包含 opacity option，原有 Worker transfer、文字、ground/environment 验证保持。
- 透明地表本地倾斜、988×800、DPR 1、80 vector commands 的最终 warm CPU median 约 4.9 ms、P95 约 7.8 ms。
  这只表示 CPU 提交，截图与真实浏览器观察用于画面判定，不用代理指标宣称 GPU 性能资格。
- 修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、patch audit、diff whitespace 检查通过。
  全 AgentDocs Prettier 仍报告 233 个既有文件格式告警，未修改无关历史文档。
- 首次测试遇到系统内存压力，Karma 断连和构建 OOM；释放本轮测试进程后串行重建成功。
  后续页面回归发现 8080 中断与 8081 被占用，负责人释放端口后已恢复正常根开发服务器；这些不是产品渲染错误。

## Delivery

本阶段唯一 upstream-owned 修改：`packages/engine/Source/Scene/GlobeTranslucencyState.js`，SGP-0012。
补丁审计确认当前 delivery upstream-owned entries 为 1、generated status 为 0。
其余代码、GLSL、Specs、Test 和文档均为 SceneGIS-owned；不修改 Scene/Pass/Globe shader 或 Cesium 实验性 MVT。
截图、日志与运行辅助文件留在忽略的 Build/Specs；不提交生成文件。

技术自审通过；负责人要求平面也支持透明，按推进授权关闭视觉 gate 与 R07 gate。
形成独立 G2 checkpoint 后开展 Planar 整体透明，其他延期资格与历史性能风险继续保留。
