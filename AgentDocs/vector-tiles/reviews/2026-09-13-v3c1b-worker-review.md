# Review: V3C1B 异步矢量准备

## Metadata

- Status: `completed`，技术自审通过，负责人授权继续交互优化
- Reviewer role: `architecture`；当前 Agent 自审，不是独立评审
- Created / Updated: `2026-09-13`
- Target: `feature/vector-tiles`，V3C1A checkpoint `413b7ffcc6` 后的独立工作区
- Plan: [V3C1B](../plans/2026-09-13-v3c1b-worker-preparation.md)
- ADR: [ADR-0067](../../../Documentation/SceneGIS/Decisions/ADR-0067-vector-worker-preparation.md)
- SGP: None

## Findings and disposition

| ID        | Severity    | Status   | Owner                  | Evidence / disposition                                                                                                                                                                                               |
| --------- | ----------- | -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3C1B-R01 | high        | fixed    | execution              | 原先 Source/public fetch continuation 同步 decode、normal update 准备 geometry 和 glyph/layout。现在真实 Worker 完成这些 CPU 工作；typed buffers transfer，调用方 decoded arrays 不 detach，Specs 与真实页面已验证。 |
| V3C1B-R02 | high        | fixed    | execution              | 仅迁移 decode 不能消除整 tile GPU 上传尖峰。prepare/result 合计限制两块，按 batch 时间/字节预算分帧，完整后原子 publication；1-byte 预算 Spec 证明无半块发布，隐藏会释放临时 GPU。                                   |
| V3C1B-R03 | high        | fixed    | execution              | stale revision、隐藏和 destroy 后迟到结果不得发布。Worker token 隔离，任务完成仅存 CPU，pick/depth 不推进；Specs 及 E2E 验证图层重建终止两个旧 Workers。                                                             |
| V3C1B-R04 | high        | fixed    | execution              | 新 Worker entry 在未重启开发服务器时实际返回 500，TaskProcessor 未拒绝挂起任务。自有池监听 native error/messageerror，明确拒绝活动与排队任务并终止池；真实 Worker ErrorEvent 回归通过。没有 fallback/retry。         |
| V3C1B-R05 | medium      | fixed    | execution              | structured clone 不保留 freeze；主线程重新冻结 pick identity。Normalized shaping 记录 atlas generation；字号变化复用，资源重载后重新准备，真实 glyph 回归通过。                                                      |
| V3C1B-R06 | performance | accepted | architecture           | Worker 初始化与独立 V8 编译增加首次完整就绪等待；本次同视图从 1.48 秒到 2.46 秒。CPU 提交峰值下降不代表首屏更快或稳定 60 FPS。                                                                                       |
| V3C1B-R07 | performance | open     | architecture/execution | GPU/Shader 创建、当前相机 placement、pick remap 仍在主线程；单 batch 是不可分割软预算。总驻留字节上限、Worker 内 decoded cache 和密集视图吞吐量尚未资格确认，后续以实际应用浏览器 profiling 决定下一步。             |
| V3C1B-R08 | gate        | pending  | project owner          | 公开页默认已启用 Worker，无切换开关。技术资格通过，等待真实浏览器缩放/拖动/旋转与新 tile 加载验收；阶段 checkpoint 在 gate 关闭后创建。                                                                              |

## Validation

- 完整 root/engine build、build-ts、tsc、build-release 通过。类型生成仍有既有 TSD-JSDoc 告警。
- 142 项 vector Specs 通过：真实 Worker decode、prepared geometry/anchors、glyph/shape、transfer、
  错误、bounded pool、销毁；Source raw、Layer 异步 publication/cover/picking/cancel 与 Symbol 缓存回归。
  初次新增缓存测试引用了错误的 private 字段，已按源码修正；未修改产品行为迎合测试。
  先 build engine 再运行 engine Specs；没有将旧 bundle 的 140 项结果作为最终资格。
- 11 项本地 E2E 通过，覆盖城市/延迟父子替换、样式图集、点标注、沿线标注和公开地图。
  公开页使用 deterministic fixture 拦截外网，验证两个 Worker 创建与重建时关闭，
  Bright/Liberty、HTTP 503 保留旧图、原生 FPS、5° 覆盖、俯视拉远及本地地形/影像对照。
- [包验证脚本](../../../Test/vector-tiles/verify-worker-package.mjs) 已通过 installed engine tarball、
  release ESM 与 IIFE 三条实际浏览器路径：默认 decoded Source API、raw buffer transfer、
  5 层/5 要素、typed geometry 和 TaskProcessor destroy；entry 不进入 public barrel/declarations。
- 在线 Berlin Bright 画面已查看，沿线 Test 倾斜截图已检查；自动化/Agent 画面检查不替代负责人验收。
- 改动文件 ESLint / Prettier、全部 AgentDocs markdownlint、upstream audit 与 diff check 通过。
  全部 AgentDocs Prettier 仍报告 233 份既有文件的格式问题；本轮改动文件单独检查均通过，未扩大格式化范围。
  upstream audit 确认当前 delivery upstream-owned entries 为 0、generated status 为 0。

## Cold-load evidence

同机 Windows / Playwright Chromium headless，1280×800 CSS、DPR 1，Berlin Bright z14。
测量不同时运行其他测试；以创建 Layer 到 tilesLoaded 为冷加载范围。
两次相同 2 请求、257305 字节、3185 features，最终 97 commands、28 candidates、12 placed、14 duplicates；无错误。

| Metric                                   | 主线程准备基线 | Worker 最终采样 |
| ---------------------------------------- | -------------- | --------------- |
| preRender → postRender 最大 CPU 提交     | 216.9 ms       | 44.9 ms         |
| 基线第二个明显提交尖峰 / Worker 次大样本 | 126.6 ms       | 8.7 ms          |
| 首次完整就绪                             | 1481.8 ms      | 2462.3 ms       |
| Worker tasks / 累计 Worker 工作时间      | 无             | 8 / 766.8 ms    |

47 ms MVT decode 已在 Worker，不是主线程耗时。在线网络、Worker 冷启动/JIT 和设备调度使
first-ready 不是严格可重复的性能 hard gate；没有宣称普遍 FPS 提升。
页面 Long Tasks 仍存在 67–235 ms 区间（另有启动任务）；pre/post 指标不包含全部浏览器/native 开销。
单独主线程 CPU profile 的显式热点含 createAndLinkProgram（约 40 ms self samples）、batch resources
和 placement；大部分 samples 为 native program，不据此推断其全部都是 GPU。
原始 JSON、profile 与截图留在本机临时/忽略产物，不提交 AgentDocs。

## Delivery and remaining boundary

- 网络继续走 Resource/Request，当前相机 placement 与 GPU 保留主线程；没有 terrain/Globe 新资格。
- Worker stateless tile 任务在几何/整数 layout 失效后会重新解码；只复用编译 style。
  原始 payload 保留在按 tile 数量控制的缓存，不等于全局字节硬上限。
- 默认 Source decoded API 的 lazy 双 Worker 池为模块共享、页面生命周期；Layer raw 路径使用
  Layer-owned pool，销毁不影响借用 source 或其他 Layer。
- 本轮修改 upstream-owned files：无；新增 SGP：无。唯一新 Worker 路径已在 Architecture/ADR 登记。
- 当前不激活后续阶段；由负责人验收与剩余性能反馈确定 R07 的后继工作。

## Owner motion feedback and fix

负责人反馈浅角持续拖动/旋转约 20 FPS，R08 继续 pending。实际应用浏览器读取到
55 visible tiles、1578 commands、1187 candidates，以及 14/8801/5372、5/16/10 两块 Worker 错误。

- **V3C1B-R09 / high / fixed / execution**：GeometryPipeline.fitToUnsignedShortIndices 的大于等于
  65536 vertices 分支返回普通 indices/attribute arrays，byteLength 因而成为 NaN。
  自有 helper 按 componentDatatype 转为 typed buffers；新增真实 Worker 17000 points / 68000 vertices
  Spec 验证分块、Uint16 indices、属性类型、索引总数与字节数。原页面两块失败 tile 最终均为 ready。
- **V3C1B-R10 / performance / fixed / execution**：Profiler 显示持续交互主要消耗在 symbol update、
  shape/bounds、appendQuad 与 GC。世界字形几何/编码按 anchor/layout/scale/flip 复用，viewport CSS
  geometry 复用，bounds 使用线性扫描，顶点使用可复用 typed staging，font/range dependencies 在 Worker
  去重。继续每帧当前视图投影/碰撞；不改变显示范围或降低排版频率。
- **R07 仍 open**：约 1500 条命令提交、候选收集与当前帧投影/碰撞仍有开销，没有稳定 60 FPS 资格。

实际应用浏览器 canvas 1432×1150 CSS，camera position 约 (1491475.7423, 6886513.5626, 2158.4347)，
direction 约 (0.013385, 0.976122, -0.216810)，zoom 13.7273140626。
保持相机/frustum，分别 60 帧 X 方向 ±300 米正弦平移、围绕视轴地面交点 ±0.14 rad 旋转；
前后均使用主线程 Profiler，不同时运行其他测试。最终采样前预热相同轨迹，期间没有新 Worker 任务。

| Metric                    | 修改前         | 最终修改后     |
| ------------------------- | -------------- | -------------- |
| Pan CPU median / P95      | 36.2 / 41.5 ms | 22.0 / 23.7 ms |
| Rotate CPU median / P95   | 36.0 / 40.2 ms | 22.8 / 30.2 ms |
| GC self samples，两段合计 | 327.6 ms       | 61.3 ms        |

这是同机实际应用浏览器的 CPU 提交证据，不把 reciprocal CPU 或 rAF median 当作持续 FPS。
修复错误后采用完整 ready cover，最终相同视角为 1553 commands、1265 candidates、201 placed，
修改前存在两个失败 tile 与 fallback，为 1578 / 1187 / 196；因此不是逐要素完全相同的内容集。
收益不是通过减少候选数取得。刷新并恢复原相机后，页面无错误、pending 收敛；只保留正常产品状态。

最终 143 项 vector Specs 和 8 项相关 E2E 通过，涵盖点/沿线/公开页面、倾斜、拾取、DPR、
资源复用/销毁与失败保留；沿线倾斜截图已查看。Engine/root dev build、release 和
installed engine / release ESM / IIFE Worker transfer 再验证通过。公共 API 与 Shader 接口未变化，
不重复此前已通过的 declaration/tsc。当前阶段仍等待负责人继续视觉/交互验收，未创建下一阶段。

## Gate closure

负责人要求先完成已讨论的三项标注交互优化，按推进授权关闭 R08；不是对稳定 60 FPS 的确认。
R07 改为 `deferred`：placement、碰撞代理与静态/动态 buffers 由后继 V3C1C 承接，
总驻留字节硬上限、Worker decoded cache 与 GPU 吞吐保留为全局后续风险。
先提交本阶段代码、Specs、ADR 与证据，再激活后继 phase；以上 pending 记录保留为历史过程。
