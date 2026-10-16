# D2 动态绘制规则运行时评审

- Type: review
- Status: approved technical; owner visual gate pending
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review；非独立评审
- Target: [D2 plan](../plans/2026-10-16-d2-layer-style-runtime.md)
- Related: ADR-0163、ADR-0067、ADR-0076；upstream-owned files / SGP：无

## Findings 与处置

- P1 / fixed：共享 compiled Style 不能原地修改。D1 已提供冻结完整快照与候选校验，
  Layer API 只发布实例独有候选；getter 即时反映配置，保留 name/metadata，错误不污染旧值。
  证据：17 项 Core、Layer 隔离/非法输入/状态保留 Specs。
- P1 / fixed：初始 Worker 配置固定、在途结果可能重新发布旧规则。
  source revision 拦截旧 completion/error，Worker slot 按 snapshot 同步配置；初始 configuration 不原地改变。
  证据：真实双 Worker 配置测试、隐藏/待请求/连续编辑/在途完成/destroy 回归通过。
- P1 / fixed：symbol 全瓦片缓存与当前 owner Style 会混合新规则和旧 layout。
  候选组保留已发布 Style，缓存按内部层身份复用，内容变化取消旧 placement。
  证据：paint/layout/filter、无关候选、shaping/glyph 复用、已有移动与拾取回归通过。
- P2 / fixed：无初始 pattern 的 Layer 缺少 owner。首次设置显式建立 lazy owner，正常帧才请求上传；
  两世界启用、删除、复用、destroy Specs 通过。background 颜色与 visibility/default 的资源替换也通过。
- P2 / fixed：精确颜色测试依赖旧默认环境，symbol cache 断言依赖旧粒度。
  Layer/Styles fixture 显式隔离环境和 gamma；断言改为检查内部层 cache；颜色容差不变。
  示例同样使用固定的样式显示条件，产品环境默认值不变。

## 验证与基线

使用 Chrome Headless 155、真实 Worker/GPU 测试。仅执行相关范围，没有运行全仓渲染矩阵。

| 验证                                            | 结果与风险覆盖                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Core `SceneGISVectorTileStyle`                  | 17 通过，完整快照、原子失败、表达式、null/default                                      |
| Layer/Styles/Symbols/Globe/Patterns/Worker 六组 | 113 项：112 通过、1 项已知失败；包括 9 项新增动态规则测试                              |
| 后补 background 专项                            | 1 通过，旧资源释放、颜色变化、visibility 删除恢复                                      |
| 控件与导出 E2E                                  | 4 通过，Planar/Globe × development/release；真实 JSON 下载、恢复及 state/resource 身份 |
| 完整构建和类型                                  | build、build-release、build-ts、tsc 通过；声明包含全部新方法                           |
| 静态与文档                                      | scoped ESLint/Prettier、Markdownlint；全量 AgentDocs 格式历史问题见下文                |

最初 vector 广域 260 项为 227 通过、33 失败。以 D1 checkpoint `7414056515` 的四个运行时文件
替换当前实现、排除新增 dynamic rules 后，同环境 251 项为 220 通过、31 失败，随后恢复当前源码并完整重建。
对照只用于判断已有失败，没有以替换后的结果宣称新 API 通过。

其中 31 项相同失败涉及默认环境精确颜色、两项错误类型身份、pick 派生对象路径和三项 batch 资源测试。
修正此次涉及的颜色 fixture 后，六组专项只剩 `retains GPU resources across warm frames and pick/depth replay and destroys them on removal`
在读取 `derivedCommands.picking.pickCommand` 处失败；旧运行时有同一 TypeError，未放宽断言或修改无关派生管线。
未纳入专项的其余旧失败不宣称已解决。原广域另一次 Globe terrain circle 高度断言失败，在基线和最终 Globe 专项均通过；
未修改地形流程，保留波动观察，若再次复现再单独定位。

Scoped 文档检查通过；全量 AgentDocs Prettier 的 452 个未修改历史文件格式警告已在 D1 存在，
本次不批量改写无关历史。全部 AgentDocs Markdownlint 通过。
本机日志、截图均在忽略的 `Build/`，不作为需要提交的生成文件。

## 更新成本与所有权

单个 fill 编辑测试：源请求仍为 1，原始 payload 与无关 base batch 身份不变，相关上传增加 1。
symbol 编辑保留其他组、glyph 页和相同 normalized shaping；pattern 删除/恢复不再次下载 sprite。
双 slot task processor 身份不变。Setter 只做同步候选编译和调度标记，没有 GPU 操作。
没有新增每帧完整 Style 编译，也没有声称实现 paint-only subrange 或所有瓦片原子切换。
完整 Style clone/compile 的编辑成本随样式规模增长；原始缓存保留不保证 Worker decoded 数据零复制。

所有改动为 SceneGIS-owned 文件。Upstream-owned files：0；SGP 增量：无。未修改 SDK、生成产物或依赖版本。
本地仍使用负责人指定的 `scenegis/develop`，WebGPU stash 保留，无新 worktree，无远端 push。

## Gate 与后续

Architecture 技术、自审和 D2 本地 checkpoint gate 通过；提交号由同一提交 Git 历史定位。
负责人尚未对本次新增动态规则做视觉验收。引擎 Agent 的下一步是收集两世界样式增强页反馈，
通过后关闭 extension 的人工 gate；旧基线失败由后续独立回归任务处理，不阻塞这项已验证 API 的技术 checkpoint。

SDK 集成者升级到 D2 提交或其后继，统一主 bundle、Worker 与类型文件，按内部样式层 ID 调用七个方法。
`null` 删除，`undefined` 报错；getter/getStyle 同步，GPU 异步，错误监听 errorEvent。
URL 样式的导出使用当前 inline snapshot；引擎不写远端、不序列化临时 state、不替换 SDK lock。
