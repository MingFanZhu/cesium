# E1 上手示例自审

- Type: `review`
- Status: `technical review passed — owner gate confirmed by progression`
- Author/Owner: 当前 Agent，architecture/execution 自审，非独立评审
- Updated: `2026-09-14`
- Target: [E1](../plans/2026-09-14-e1-quickstart-examples.md)，基于 V3C1D checkpoint `971a7b333b`
- Upstream-owned changes: None；SGP: None
- ADR: 不改变产品架构、API 或协议；仅组装已资格能力，无新增 ADR

## Findings and disposition

| ID     | Severity | Finding / evidence                                                            | Status / owner / follow-up                                                                  |
| ------ | -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| E1-R01 | Medium   | 原公开示例混合双世界、地形、环境和性能诊断，不能直观展示最少初始化步骤。      | fixed；当前 Agent；四个独立 HTML/JS，只共享外观 CSS；每页源码和样式可直接查看，旧验收页保留 |
| E1-R02 | Medium   | Planar 必须声明 maximumLevel；初次浏览器运行缺项触发 DeveloperError。         | fixed；当前 Agent；两页明确使用 18，真实 WebGL 加载与拾取通过                               |
| E1-R03 | Medium   | Resource 的 RequestErrorEvent 没有 message，503 错误被页面写成空白。          | fixed；当前 Agent；用 message 或 String(error) 展示；503 独立回归通过，同世界离线入口保留   |
| E1-R04 | Low      | 本地 fixture 复用至各 XYZ，不是相机所在城市的真实地理数据。                   | documented；当前 Agent；页面、style attribution 和 README 显式说明合成数据及字库范围        |
| E1-R05 | Medium   | 公开服务依赖网络；固定 Bright 的 building-top 使用尚不支持的 fill-translate。 | documented；当前 Agent；显式排除单层并保留说明/署名，公开与离线示例独立，不自动换源         |
| E1-R06 | Gate     | 负责人确认四页的简单程度、代码可读性与双世界画面。                            | pending；项目负责人；入口已提供，通过后建立独立 checkpoint                                  |

## First revision verification

`Specs/e2e/scenegis-vector-examples.spec.js` 新增 5 项有界回归，
使用 `Test/vector-tiles/playwright.config.mjs` 连接根服务器，不依赖 Sandcastle。
四页加载用真实 WebGL，中心原生 pick 返回对应 MVT source，已绘制瓦片和命令均非零，
本地页有 placed symbols，tile/symbol failure 均为零。
公共页面使用本地 fixtures 拦截 TileJSON、MVT、字体和 sprite；其 attribution 进入原生 credit display。
本地页阻断全部外网，四页均没有 environment.js 请求、JS 异常或意外外网请求。
BFCache pagehide 不销毁；非缓存离开释放 Viewer/Layer 和 canvas，重复清理无异常。
异步样式加载完成后检查 Viewer 是否已销毁，保持现有资源所有权。

首次运行四项加载/生命周期测试通过，第五项暴露 R03；修复后仅重跑 503 回归并通过。
另在实际浏览器打开两个公开页面，真实 OpenFreeMap 数据和标注加载完成，紧凑导航可用，未加载高级环境。
没有产品热路径变化，不开展新的性能矩阵或 engine/release 构建。

## Remaining boundary

本阶段只降低接入与阅读成本，不改变既有样式支持范围、贴地资格或性能承诺。
V3C1D-R05 和 V4B-R06 仍由总体计划后继阶段跟进。
源码格式、文档和所有权检查结果记录在 E1 phase plan；负责人视觉 gate 关闭前不标记阶段完成。

## Owner revision

负责人追加要求：新页面中文命名、删除本地上手示例，旧测试页也区分世界并移除高级环境。
以上 R01/R04 和五项测试结果属于首版历史；最终交付为两页公开示例，fixture 只保留给旧测试和自动化。

| ID     | Severity | Finding / evidence                                              | Status / owner / follow-up                                                                                                                                     |
| ------ | -------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1-R07 | Medium   | 旧 public.js 根据 body 属性切换世界，环境模块与其生命周期耦合。 | fixed；当前 Agent；planar-map.js/globe-map.js 独立 world、camera、terrain，双世界地形/拾取/资源 E2E 通过；map-test.js 只提供共同测试交互，基础地形光照直接配置 |
| E1-R08 | Medium   | 更名可能留下导航、E2E、文档与源码引用悬空。                     | fixed；当前 Agent；16 项受影响矢量页面 E2E 全部通过，51 份页面/文档/源码的 309 个静态引用无缺失                                                                |
| E1-R09 | Low      | 删除高级环境页面功能后，原环境 E2E 不再有测试对象。             | accepted；当前 Agent；仅删除该页面 E2E，engine Specs 和 verify-worker-package.mjs 中的环境与 Shader 资格保留                                                   |
| E1-R10 | Low      | 删除本地上手版后，新两页有网络前提。                            | accepted；项目负责人明确要求；页面标明网络依赖和错误，通过链接进入保留的离线测试页，不自动 fallback                                                            |

原 E1-R06 视觉/易读性 gate 仍 pending，范围更新为两个中文上手页和精简后的旧测试入口。

新版一次运行 16 项 E2E 全部通过（约 2.1 分钟），包含两页中文入口、TileJSON 503、
Globe 本地地形、平面真实地形替换、Bright/Liberty、pick/recreate、浅俯角/俯视远景、点/沿线标注和城市替换。
Globe 回归额外确认没有环境面板和时间控件，并通过 BFCache 保留/非缓存离开销毁 Viewer、Layer 和 Worker。
实际浏览器中文目录可用，球面公开地图加载成功，地图与标注可见；ESLint 通过。

负责人随后确认独立矢量层方向并授权透明地表适配，E1-R06 按推进授权 accepted。
前述 pending 保留为历史；先独立提交 E1，再进入后续渲染阶段。
