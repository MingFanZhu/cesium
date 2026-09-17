# 高级环境功能示例评审

- Type: review
- Status: approved（技术自审；上手体验交付负责人查看）
- Updated: 2026-09-18
- Author / owner: 当前 Agent，architecture/execution 自审，非独立评审
- Target: [standalone plan](../plans/2026-09-18-functional-examples.md)
- Upstream-owned files / SGP: 无

## Findings

- Fixed：历史大页面混合各类效果、阶段预设、服务诊断和资源检查。新建五类效果、各含球面与平面，
  每页独立组装公共 API；综合页迁移到 `tests/`，旧 URL 跳转到功能目录。
- Fixed：说明区和控件区分开，使用 vendored lil-gui 的默认外观；共享文件仅负责 CSS 和页面清理。
- Fixed：Globe 的 `skyBox: false` 会阻止 CesiumWidget 创建 Sun/Moon。球面保留原生对象创建后隐藏，
  原生月面仅在日月光照页显示；Planar 不访问不存在的 Globe 日月对象，而显式注册天文方向控制器。
- Fixed：迁移同步修改脚本、CSS、页面互链和旧 E2E 路径；旧 Clock E2E 的 A11 按钮匹配当前“本地模型”名称。
- Verified：新示例完全使用本地资源；effects 只开启所属效果，三组本地模型显示空气衰减或昼夜照明。
  云时间由原生 Clock 更新，离开页面移除 listener/controller；BFCache 保留 live 页面。
- Accepted：环境页验证以 effects ready、实际渲染、控件和释放为边界，不等待低视角全部地表细分结束。
  页面配置采用仓库 Chromium channel；不为示例测试启动 Sandcastle。

## 验证

11 项新页面/导航 E2E 通过，覆盖十页 effects ready、代表控件绑定、Clock、BFCache、
重复释放及目录/旧 URL。迁移后的 Globe 与 Nanjing Planar Clock 两项原回归通过（1.1 分钟），
包括时间轴、公开数据失败提示及 listener 释放。没有启动 Sandcastle 或执行无关完整回归。
已自查球面物理大气、平面体积云、球面低日照光晕、平面雾和夜间模型画面；
控件保持默认外观，默认视角显示所演示的效果。
Scoped ESLint、whitespace 和官方基线所有权检查通过。全 AgentDocs Markdownlint 通过；
全量 Prettier 仍有 231 个历史文件不符合格式，修改范围通过，未扩大为无关文档格式化。

## 边界与交付

本轮不改变引擎 API、Shader、Worker、构建或产品光学参数契约；原阶段质量与性能边界保持不变。
旧综合页继续保留公网数据和诊断，不作为新的上手代码。公开影像/地形的网络依赖只保留在明确的接入示例中。
新增功能页的最终上手体验由负责人查看，技术自审不代替其视觉反馈。
