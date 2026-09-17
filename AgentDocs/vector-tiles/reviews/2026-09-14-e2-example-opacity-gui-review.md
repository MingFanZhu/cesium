# E2：上手示例透明度自审

- Type: `review`
- Status: `completed — owner progression accepted`
- Author: 当前 Agent，architecture/execution 自审，非独立评审
- Updated: `2026-09-14`
- Target: [E2 plan](../plans/2026-09-14-e2-example-opacity-gui.md)
- ADR/SGP: None；仅修改 SceneGIS-owned 示例、E2E 与文档

## Findings and disposition

| ID     | Severity | Finding / evidence                                                                                                                              | Owner / disposition                              |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| E2-R01 | medium   | GUI 必须使用公共 Layer.opacity，并完整处理页面释放及 BFCache。两个示例各自直接绑定，0/.5/1 数值及拾取、BFCache 保留、重复 pagehide 销毁均通过。 | 当前 Agent / fixed，3 项既有上手 E2E             |
| E2-R02 | low      | 浅色 GUI 标题曾有对比度问题。按负责人修正移除全部 lil-gui 主题覆盖，说明与默认深色面板分成独立两块。                                            | 当前 Agent / fixed，内置浏览器视觉检查           |
| E2-R03 | low      | 真实地图仍依赖公开 TileJSON、瓦片、glyphs 和 sprite 网络服务；控件在 Layer 创建后显示。服务失败保持已有错误提示与离线测试链接，不自动换源。     | 当前 Agent / accepted existing contract，503 E2E |

## Verification

- 3 项上手 E2E 通过，外网用本地确定性数据拦截；双世界透明度 .5/0/1 和拾取恢复、GUI/Viewer 生命周期、网络失败均覆盖。
- 实际内置浏览器确认两个公开地图正常显示；平面 .5 视觉生效并恢复默认 1。负责人修正布局后再次确认说明与默认 GUI 分离，纵向排列在左上角，不遮挡 Cesium 原生 FPS。
- 初轮 E2E 将统计中的 prepared drawCommands 误作零 opacity 的提交命令数，修改为公共属性与 native pick 验证后通过；未为测试改变产品实现。
- 修改范围 ESLint/Prettier、文档与 diff 检查结果见 phase plan 的交付记录。
- 仅复用 Test/lib 的 lil-gui 0.21.0，原始库未改动；无产品 API、Shader、Worker 或构建变化，不重复 engine/build/release 验证。

## Gate and follow-up

技术自审通过；2026-09-17 负责人要求推进建筑拉伸，按推进授权关闭 E2 gate，由当前架构 Agent 先形成独立 E2 checkpoint。
未解决风险仅继承公开数据网络依赖和既有渲染能力边界，本阶段不扩展透明地表或高级环境资格。
