# Review: V5A 平面点标注

## Metadata

- Status: `completed`，技术自审通过，负责人在修正交付后授权推进特殊标注
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审，不是独立评审
- Created / Updated: `2026-09-13`
- Target: `feature/vector-tiles`，V3C0 checkpoint `0bec9cbe56` 后的 V5A 工作区
- Plan: [V5A](../plans/2026-09-13-v5a-point-symbols.md)
- ADR: [ADR-0063](../../../Documentation/SceneGIS/Decisions/ADR-0063-point-symbol-renderer.md)
- SGP: None

## Scope

独立 glyph PBF、字体页缓存、普通 sprite、横排 point layout、跨 source/style collision、
稳定跨 tile identity、自有 glyph/icon GPU 图元与 native pick 派生；
扩充 Style/Layer 配置和统计、公开地图 point layers、本地页面与自动化 fixtures。
不使用 Cesium 实验 MVT、LabelCollection、BillboardCollection 或地图颜色 RTT。

## Findings

| ID      | Severity    | Status   | Owner                        | Evidence / disposition                                                                                                                                                  |
| ------- | ----------- | -------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V5A-R01 | medium      | fixed    | execution                    | 真正 Noto PBF 的空格省略 bitmap；默认空 bitmap 并校验非空尺寸，glyph malformed/space Specs 通过                                                                         |
| V5A-R02 | medium      | fixed    | execution                    | 样式库 icon-padding 返回 Padding 实例；前端规范化为四边数组，Specs 证明输出无库对象                                                                                     |
| V5A-R03 | high        | fixed    | execution                    | 跨 atlas 的 overlap batch 会重排 feature；相关层保留 feature 顺序，红/蓝交叠的真实像素与 pick Spec 通过                                                                 |
| V5A-R04 | high        | fixed    | execution                    | 迟到字体结果与缓存淘汰可能持有旧资源；发布引用先移除再 LRU、取消并忽略旧结果，销毁/缓存 Specs 通过                                                                      |
| V5A-R05 | medium      | fixed    | execution                    | 同内容匹配必须与碰撞结果独立占用旧 identity；单独 matched 集合，延迟 LOD、量化边界去重与跨边拾取通过                                                                    |
| V5A-R06 | medium      | fixed    | execution                    | Bright 街道级存在 office 等缺失图标；对照 MapLibre 源码保留文字，名称进入显式提示，缺失 entry Spec 与在线 smoke 通过                                                    |
| V5A-R07 | boundary    | accepted | architecture                 | 中文街区超过 64 ranges；公开 Test 页明确配置 192，产品默认预算保持有界，不静默扩容                                                                                      |
| V5A-R08 | medium      | fixed    | execution                    | 安装包 strict TS 发现 glyphs/sprite JSDoc memberof 未被解析；改为独立标签行并重新生成类型                                                                               |
| V5A-R09 | scope       | deferred | architecture/execution       | 沿线、复杂 shaping、variable anchors、动画、地形/Globe不在本阶段；对应 [roadmap](../plans/2026-09-12-vector-tiles-extension.md) V5B/V5C/G1                              |
| V5A-R10 | performance | deferred | architecture/execution       | 非索引动态 buffer、同步 glyph decode/layout 和整 range atlas 先形成有限负载基线；大负载字节预算/分块/Worker 属于 V3C1                                                   |
| V5A-R11 | gate        | accepted | architecture / project owner | 浅俯角修正交付后，负责人要求继续实现特殊标注；按该推进授权关闭阶段 gate，不把此前基础地图通过或本次推进指令记作新的逐项视觉验收                                         |
| V5A-R12 | high        | fixed    | execution                    | 公开页改为透视，style zoom 取视轴前向交点；原中心/heading/5° 俯角与 12.05 zoom 的实际像素及拾取通过，底部截断消除；ADR-0064                                             |
| V5A-R13 | high        | fixed    | execution                    | 依负责人要求复用 planar imagery/terrain SSE，mixed leaves 在预算内细分；共享判据、DPR、near/far alpha/pick、不可见 anchor 零字体需求通过；在线 64 tiles 横跨 level 3–14 |

## Validation

- 浅俯角修正：112 项矢量 Specs、14 项既有 PlanarQuadtree Specs 通过，共 126 项。
  共享 SSE 在相同 nominal errors 下与原 quadtree 叶集合一致，且不修改原 quadtree 状态。
  8 项 E2E 均已通过；公开页新增 5°/12.05 zoom 的混合选层和真实前景像素检查。
  POI 回归改为定位实际合成点并拾取 501，避免旧测试仅统计屏幕外标注的假阳性。
  Test 页相机变动后等待可见标注与 tilesLoaded 这一实际完成条件，不添加 settling frames。
- 本次新增代码只涉及私有 SSE/coverage/placement 和 Test 组装，无新公共 API、Shader 或 Worker；
  engine/root build 与受影响 Specs/E2E 已顺序完成，沿用上一轮已通过的 V5A types/release 资格。
- 浅俯角修正的 ESLint、修改范围 Prettier、diff whitespace、全 AgentDocs Markdownlint 与上游审计通过。
  全 AgentDocs Prettier 仍为 233 份既有未修改文件的格式问题；本次未扩散格式修改。
  当前 delivery upstream-owned files=0、generated status=0，无新增 SGP。

- 108/108 focused Specs，真实 Chromium Context；新增 21 项覆盖 glyph/style/layout/collision、
  SDF/RGBA pixels、native alpha pick、warm/camera reuse、destroy、失败、LRU、迟到 completion、
  LOD owner 保留、空间量化去重、完整 glyph 跨 tile 及 overlap 的多 atlas 绘制顺序。
- 7 项页面 E2E 通过：保留城市/延迟替换/样式图集 3 项；公开页 2 项与新增 symbols 2 项。
  本地 glyph/sprite/MVT，外网拦截；检查中英文实际 alpha 拾取、POI、尺寸、倾斜、DPR=2 和重建。
- Berlin Bright z14 与 z16 倾斜在线 smoke 已检查，z16 为 1384 candidates / 745 placed，
  symbolFailures=0，缺失 image 名称 office/sports_centre/atm/hackerspace 有显式提示。
- 北京 14 级中文 smoke：555 candidates / 278 placed，72 cached ranges，427 commands；
  glyph CPU 32,218,443 bytes、symbol textures 18,495,488 bytes，symbolFailures=0。
  这是从柏林切换后的缓存统计，包含历史页面；正式页明确配置 192 ranges。
- API/Shader qualification：engine/root build、完整 build-ts、tsc、build-release 通过；
  独立 engine tarball 安装验证五个公共入口、六份 Shader、glyphs/sprite 只读属性和三个新增选项，
  strict TS 与 release CJS 消费通过。类型生成保留既有 TSD-JSDoc warnings。
- 构建和测试共用生成目录，必须顺序执行；并行执行曾造成读取生成中 Shader 的冲突，
  顺序重建并重跑后通过，没有为此修改产品源码或上游构建。
- 修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、11 份文档的 115 个相对链接与 diff whitespace 通过。
  全 AgentDocs Prettier 仍报告 233 份未修改的既有文档，与进入阶段时相同；不扩大格式修改范围。
- 上游审计通过，58 个当前改动路径中 upstream-owned files 为 0，generated status 为 0，无新增 SGP。

## Performance evidence

浅俯角修正在线检查：同一用户中心/heading，pitch=-5°，style zoom=12.04994，
canvas 1141×1150 CSS pixels、DPR=1，Bright 数据版本仍为 `20260906_080001_pt`。
64 desired / 68 resident，level 3–14，1253 commands，498 candidates / 86 placed，
tile/symbol failures=0。当前图层累计 68 requests、7,157,551 bytes、57,641 features。
60 个 warm frames CPU median 10.3 ms、P95 11.8 ms；这比下述旧 z14 小视域负载更大，
两者不作为同场景性能增减比较，不含 GPU 完成。新 selector 仍有同步遍历成本，V3C1 继续负责密集负载优化。

Windows / Chromium，浏览器 1280×800，地图 canvas 988×800，DPR=1、MSAA=1、FXAA off。
Bright、柏林 14 级、数据 `20260906_080001_pt`；单次在线采样：

- 6 个 tiles、2,542,138 bytes、46,024 decoded features；decode 累计 164.5 ms、单块最大 39.2 ms。
- 220 candidates / 103 placed，212 commands；2 glyph ranges，CPU glyph 414,119 bytes、symbol texture 800,768 bytes。
- 首次就绪约 4293 ms；60 个 warm frames CPU median 1.8 ms、P95 2.4 ms。
  不含 GPU completion 和浏览器合成，不是高密度吞吐量承诺。

## Delivery gate

本阶段仅修改 SceneGIS-owned paths，无 upstream-owned file 与新增 SGP。
正式范围见 [VectorTileSymbols](../../../Documentation/SceneGIS/VectorTileSymbols.md)。
负责人授权继续特殊标注，当前 Agent 关闭 V5A gate 并提交独立 checkpoint；提交完成后再激活 V5B。
