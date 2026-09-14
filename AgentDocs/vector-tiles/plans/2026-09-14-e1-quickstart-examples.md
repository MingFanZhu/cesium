# E1：独立的平面与球面上手示例

- Type: `phase plan`
- Status: `completed`
- Author/Owner: 当前 Agent，architecture/execution 自审
- Architecture review: `confirmed`
- Updated: `2026-09-14`
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Predecessor: V3C1D checkpoint `971a7b333b`，负责人认可功能并转向示例简化
- Upstream-owned changes: None planned；SGP: None

## Scope and implementation

负责人要求面向程序员快速上手，平面和球面分开，不加入高级环境。
原 public.js 混合双世界、环境、地形、诊断、资源切换和性能采样，不适合当最小示例。
已核实 Layer 可以自动创建 source，Globe 默认提供正确的 EPSG:3857 单根 matrix；
不需要继承 MeasuredSource、手工组装 Globe matrix 或引用 private 模块。

1. 在 `Test/vector-tiles/examples/` 提供独立中文 HTML/JS：平面地图、球面地图，均接入公开 Bright。
   每页单次创建 Viewer、加载 style、添加 Layer、定位相机；没有双世界分支、运行时重建、性能面板或环境模块。
2. 首版两页本地上手示例及独立 local-style 按负责人追加要求删除。
   公开示例复用固定 Bright 快照，显式排除已知不支持的 building-top，解析 TileJSON 后交给 Layer；
   保留 attribution 和来源链接，网络错误可见，提供同世界离线测试入口，不自动更换数据。
3. CSS 仅用于共同页面外观，不引入初始化 helper。每页公开最少的 viewer/layer 诊断引用，
   pagehide 按 BFCache 语义释放 Viewer，异步 style 完成后不向已销毁 Viewer 添加图层。
4. 旧页面按 planar-/globe- 前缀命名，独立 world/camera/terrain 入口；共用 map-test.js 测试面板。
   删除 environment.js、对应 CSS 和已无页面目标的环境 E2E，关闭 Timeline/Animation。
   入口导航、README、正式文档、E2E 与历史链接同步更名，旧目录文档精简为当前用法。
   生成链、fixtures、许可证、性能复现资料、engine/release 的产品环境验证保留。

## Validation and exit

- 新增有界 E2E 验证两页中文入口加载、双世界正确、矢量可见及清理，使用现有 fixtures 拦截服务。
- 运行改名后的既有页面回归，验证双世界地形、拾取/替换/标注/远景与生命周期；检查导航没有悬空路径。
- 实际浏览器查看双世界公开地图，确认简单布局、原生相机交互、无高级环境加载。
- 修改范围 ESLint/Prettier、文档 lint 和所有权检查；不改产品 runtime，不重复 engine/release 全量矩阵。
- 技术自审与负责人页面验收后独立提交，不将现有性能或高级 style 限制标记为已解决。

## Current handoff

负责人在页面检查后确认矢量独立层方向，并授权转入透明地表适配。E1 按推进授权关闭视觉/易读性 gate，
技术验证与示例清理形成独立 checkpoint。以下 pending 为历史；透明地表属于后续渲染阶段，不混入 E1。

最终修订已实现并技术自审通过：两页中文公开示例、七个按世界命名的旧测试入口，
旧地图测试共用交互但独立 World 初始化；本地上手版与高级环境页面组装已删除。
16 项受影响页面 E2E 一次通过，309 个静态引用无缺失，实际浏览器中文目录及球面公开地图已查看。
修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、git diff 和所有权检查通过；
upstream-owned 与生成文件变更均为零。全 AgentDocs Prettier 仍有 233 个既有格式告警。
负责人视觉/易读性 gate 仍 pending，通过后再建立 E1 独立 checkpoint；没有产品或上游改动。

### Owner revision

负责人要求继续精简旧目录、删除高级环境、新示例使用中文文件名并删除本地上手版。
E1 仍 active，以下首版四页证据保留为历史，不构成新版验收。
最终上手入口只保留 `examples/平面地图.html`、`examples/球面地图.html` 和各自同名 JS；
目录与 CSS 也使用中文文件名。按本轮明确要求删除本地上手页，不保留替代页；
在线失败明确报告，可链接仍供回归验收使用的本地测试数据入口。

旧测试页按 `planar-*` / `globe-*` 命名，独立 world/camera/terrain 初始化，
仅共用地图测试面板、数据接入、拾取与测量。移除高级环境模块、相关 CSS、时间控件及已失去页面目标的环境 E2E；
engine/release 的高级环境资格验证与产品能力保持。仍被自动化和生成链引用的 fixture、字体、来源与测量工具保留。
同步 E2E、导航和文档路径；新版验证覆盖两页中文入口、旧页面双世界/地形与其余更名页面回归，
以及销毁、错误显示和无高级环境加载。没有产品 API 或上游改动。

### First revision evidence

四个独立示例及目录、数据说明、源码链接已实现；Test 首页和正式 VectorTiles 文档已更新入口。
本地示例以合成 POI 为相机中心，公开示例定位柏林；原完整验收页面保持不变。
技术自审通过，见 [E1 review](../reviews/2026-09-14-e1-quickstart-examples-review.md)。

- 新增 5 项 E2E：四页真实 WebGL 加载/拾取、世界契约、署名、离线边界、BFCache 与销毁，
  以及公开 TileJSON 503 错误展示。首次四页通过，错误显示修复后单独通过第 5 项；没有重复全量测试。
- 浏览器真实 OpenFreeMap 双世界公开地图加载成功，文字、道路和地物可见，没有高级环境面板。
- 所有改动为 SceneGIS-owned；没有 runtime、上游集成或生成文件改动，不新增 ADR/SGP。
- 修改范围 ESLint/Prettier、全 AgentDocs 及相关文档 Markdownlint、git diff 检查通过。
  全 AgentDocs Prettier 检查仍报告 233 个既有文件格式问题；修改范围已格式化，不处理无关历史文档。
- 负责人视觉/易读性验收 pending；通过后形成 E1 独立本地 checkpoint。
- 公开网络依赖、Bright 样式排除与既有重负载性能风险保持显式说明，不由本阶段关闭。
