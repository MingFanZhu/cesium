# G3：平面透明地表自审

- Type: `review`
- Status: `completed — owner progression accepted`
- Author: 当前 Agent，architecture/execution 自审，非独立评审
- Updated: `2026-09-14`
- Target: [G3 plan](../plans/2026-09-14-g3-planar-transparency.md)
- ADR: [ADR-0073](../../../Documentation/SceneGIS/Decisions/ADR-0073-planar-surface-opacity.md)
- SGP: None；本阶段无 upstream-owned 修改

## Findings and disposition

| ID     | Severity | Finding / evidence                                                                                                                                                                                    | Owner / disposition                                                               |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| G3-R01 | high     | 每视锥 depth prepass + blending 不能阻止不同视锥的山坡叠色；只裁掉 near overlap 仍失败。采用 surface 之前的背景快照，原深度/颜色覆盖决定当前可见面；linear/log 多视锥山地全部表面像素保持 50% alpha。 | 当前 Agent / fixed，45 项 surface/shader Specs                                    |
| G3-R02 | high     | 地表为零必须继续写深度并移除隐藏地表颜色，不能跳过命令。零高程、真实地形上的矢量、样式 alpha、pick 与遮挡保持，原 Worker 引用不变。                                                                   | 当前 Agent / fixed，184 项 vector Specs 和页面回归                                |
| G3-R03 | medium   | 背景快照额外占一个 sampler，默认模式不能降低原 sampler 容量或增加复制成本。仅透明变体启用 sampler；原命令数、opaque key 和 VA 保持，首次透明变体缓存后复用。                                          | 当前 Agent / fixed，原 shader/surface 回归及 identity 断言                        |
| G3-R04 | medium   | 背景必须逐帧更新、匹配 MSAA/HDR 与窗口尺寸，恢复 framebuffer binding 并完整释放。原生 blit 到 owned FramebufferManager，正常 opaque 不复制；pick/depth 复用已发布状态。                               | 当前 Agent / fixed，非黑背景、MSAA、HDR 切换、resize 与 texture destroy Specs     |
| G3-R05 | medium   | 当前可见表面契约仍以真实深度遮挡地下/背面内容，透明不意味着能透视地下对象或后面的山坡。高级环境透明深度合成、跨表面排序仍未资格。                                                                     | 当前 Agent / deferred，继承 G2-R06，由后继 surface/environment qualification 承接 |
| G3-R06 | medium   | 透明要求 WebGL 2，首次启用分配一个视口背景目标并创建 shader variant；尺寸/HDR 改变会重建该目标。额外成本为一次背景复制和 surface 片元采样，不复制地图颜色。                                           | 当前 Agent / accepted contract，文档公开；性能仅做同视角诊断                      |

## Verification

- 255 项相关 Specs 通过：45 surface/shader、26 World、184 vector；包含既有 Globe 与环境回归。
- 6 项平面 public E2E 通过，包含新三滑块、真实地形、标注、Worker 保留、截图及 60 帧 CPU 测量，全部数据拦截为本地确定性数据。
- 完整 root/engine build、buildTs、tsc、buildRelease 与三种实际交付入口验证通过。
  installed engine、release ESM/IIFE 均在平面真实地形 alpha=0、矢量 alpha=.5 时得到 `[0,0,128,255]`，pick=`land`，资源销毁通过。
  原有 Globe 透明、符号、Worker transfer 与环境案例保持。
- 修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、patch audit 和 diff whitespace 通过。
  全 AgentDocs Prettier 仍有 233 个既有文件格式告警，未修改这些历史文件；本阶段修改文档通过。
- 实际内置浏览器：平面本地 MVT、柏林 Esri 地形、倾斜、56 个矢量命令、13/17 tiles、14/17 标注，
  矢量 .5、影像 1 已就绪，同视角地表 1/.5 的 60 帧 CPU median 为 4.8/6.3 ms、P95 为 10.9/10.4 ms，
  两者原生 FPS 约 59–60。这是有界同机诊断，透明多一次背景复制及片元采样。
  首轮测量与构建/发布包验证并行，未用于上述对照；最终对照在这些进程结束后完成。
  Headless 图形环境截图帧率不能代表实际应用，不宣称所有设备/场景稳定 60 FPS。

## Delivery and gate

全部源文件、GLSL、Specs、Test 与文档均为 SceneGIS-owned；无新增上游修改或 SGP。
复用已有 World.renderEnvironment 集成接口，未修改 Scene.js、Renderer/Pass 或 Cesium 实验性 MVT。
截图、日志与临时安装包留在忽略的 Build/Specs 或临时目录，生成文件不进入 delivery。

技术自审通过，负责人确认并要求将矢量不透明度加入 lil-gui 上手示例，按推进授权关闭 G3 gate。
G2 checkpoint `9e33cbd279` 已独立完成；先形成 G3 独立 checkpoint，再进行示例变更。延期资格保持。
