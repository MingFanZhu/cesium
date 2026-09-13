# Review: V5B 沿线与特殊标注

## Metadata

- Status: `completed`，技术自审通过，负责人已授权进入远景处理
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审，不是独立评审
- Created / Updated: `2026-09-13`
- Target: `feature/vector-tiles`，V5A checkpoint `50ab83b96f` 后的 V5B 工作区
- Plan: [V5B](../plans/2026-09-13-v5b-line-symbols.md)
- ADR: [ADR-0065](../../../Documentation/SceneGIS/Decisions/ADR-0065-line-symbol-placement.md)
- SGP: None

## Scope and findings

新增逐字曲线排布、折线测距/裁切、重复 anchors、map/viewport projection、方向保持与转角限制。
复用 V5A glyph/sprite 资源、自有动态 quad batch、Shader 和自动 pick；无 native 文字图元或地图颜色 RTT。
公开 Bright/Liberty 各接入剩余 10 个 symbol layers；新增本地沿线图集及确定性自动化。

| ID      | Severity    | Status   | Owner                  | Evidence / disposition                                                                                                                                              |
| ------- | ----------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V5B-R01 | medium      | fixed    | execution              | 字形中心恰落折线顶点时，反向路径选择另一侧切向；使用两侧单位向量的角平分线，正反曲线各角点一致的 Core Spec 通过                                                     |
| V5B-R02 | high        | fixed    | execution              | SceneTransforms 会排除负 clip Z，但 near 内侧有效视锥也包含负 clip Z；标注以 eye-relative doubles 和当前 projection 直接投影，实际跨 near 路径的渲染/pick Spec 通过 |
| V5B-R03 | medium      | fixed    | execution              | 新增道路使旧公开 E2E 的首个 candidate 不再是 POI；测试按真实 501 identity 和当前屏幕中心等待/拾取，另验证道路名称与路牌实际 placed                                  |
| V5B-R04 | medium      | fixed    | execution              | 在线目标 z16 倾斜计算得到 15.999999999999869，使 minzoom=16 箭头隐藏；只将相机计算中距整数小于 1e-10 的值吸附，连续 15.99 不量化，Core/公开 E2E 通过                |
| V5B-R05 | boundary    | accepted | architecture           | 不推断未加载道路连接，不做跨 tile 语义拼接或全局里程；与 MapLibre 的 anchor 相位/LOD 切换不保证逐像素相同，ADR-0065 和兼容文档明确记录                              |
| V5B-R06 | boundary    | deferred | architecture           | Polygon placement、complex shaping、variable anchors、text-fit、SDF icons、fade、terrain/Globe 未加入当前 profile；沿用总体路线，不静默降级                         |
| V5B-R07 | performance | deferred | architecture/execution | 本轮已消除交互期间主要重复工作；同步布局、动态 non-indexed batch、密集道路/中文缓存的整体字节预算和必要 Worker 仍由 V3C1 推进                                       |
| V5B-R08 | external    | accepted | architecture           | 负责人正在浏览的另一个在线视图累计有 Noto Sans Italic/502 字体范围请求失败；未覆盖其视角或自动重试/替代字体，有限独立柏林 smoke 无资源失败                          |
| V5B-R09 | gate        | accepted | project owner          | 负责人于 2026-09-13 同意进入远景处理，按推进授权关闭 V5B gate；形成独立 checkpoint 后推进共享选层                                                                   |
| V5B-R10 | high        | fixed    | execution              | 相机移动逐帧对被过滤要素求值、重算 anchors/shape keys，并逐 glyph 重取 Camera getters；提前过滤、驻留 tile layout 缓存与每轮 projection snapshot 消除主要 CPU 热点  |
| V5B-R11 | high        | fixed    | execution              | 大坐标比例往返误差与 fractional zoom 使整 tile 重建；直接 frustum pixel scale、逐层实际值 key 和 constant paint attributes 保持资源，半径超界只重建对应层           |

## Validation

- 131 项 vector Specs 的覆盖通过：本轮最新 engine 构建的原有 129 项回归通过，
  新增两项远景 fixture 修正后重新通过 20 项 symbol Specs；
  覆盖区域裁切、弧长间距、逐字切向、正反阅读、短线/锐角、逐 glyph collision、
  map/viewport 倾斜差异、真实 alpha pick、相机重排、warm VA/command 复用与销毁。
  邻 tile 的重复抑制和 glyph 越过 anchor ownership 边界、跨 near 路径均有真实 Context 证据。
  交互修复新增/增强预过滤与缓存失效、fractional paint、旋转比例稳定、真实像素/pick、
  线宽半径分档及 VA/pick IDs 复用、逐层替换和 cache 销毁回归。
- 最终 9 项页面 E2E 全部通过，公网请求被本地 fixtures 拦截；
  保留城市/样式/点标注/5° 浅角回归，新增曲线/箭头/路牌、180° 旋转、倾斜、缩放与资源重建。
  已查看新图集的俯视和倾斜截图，底部短线/锐角正确不显示名称。
- Engine/root build、ESLint 与 tsc 通过。新增两个 private 模块由既有构建入口生成；
  没有新增公共入口、类型字段、Shader source、Worker 或上游集成缝隙。
  V5A 已通过的六份 Shader 与 release/installed-package qualification 不重复执行。
- 当前修改范围 Prettier、全 AgentDocs Markdownlint、14 份文档的 172 个相对链接、diff whitespace 与上游审计通过。
  全 AgentDocs Prettier 仍报告 233 份既有未修改文件，与 V5A 基线相同；没有扩散格式修改。
  当前 delivery upstream-owned entries=0、generated status=0，无新增 SGP。

## Online and performance evidence

在独立的旧公开标签页验证，未覆盖负责人正在操作的地图相机。Windows / Chromium、
实际 map canvas 1308×1000 CSS pixels、DPR=1、MSAA=1、FXAA off。
Bright、Berlin、数据 `20260906_080001_pt`：

- z14：4 desired / 4 resident、191 commands，38 candidates / 12 placed，14 repeats suppressed，
  tile/symbol failures=0。实际 placed 含 major road names 和 waterway names。
  4 requests / 502,378 bytes / 6,050 features，decode 38.2 ms、max 18.5 ms。
  60 warm frames CPU median 2.2 ms、P95 3.4 ms；不含 GPU completion 或浏览器合成。
- z16、45°：4 desired / 8 resident、167 commands，463 candidates / 160 placed，
  31 repeats suppressed，3 glyph ranges，symbol textures 931,840 bytes，failures=0。
  含 2 路牌、22 major / 27 minor / 19 path names、64 arrows、1 waterway 与既有 point labels。
- 上述 workload 与 V5A 旧选层/viewport 不同，不能据此宣称相同比例的性能提升或降低；
  基础城市本地 E2E warm median/P95 为 1.0/1.4 ms，25 commands、5 resident，未见回归。

## Interaction regression and repair

负责人在真实公开地图确认拖动、缩放、旋转帧数骤降。使用南京 Bright、1141×1150 CSS、
DPR=1、固定初始相机和各 60 帧 pan/zoom/rotate，预热相同轨迹后采样。
公开资源 HAR 和旧 bundle 保存在忽略的 Build 中；修复版重放相同公网响应。
`Test/vector-tiles/profile-motion.mjs` 保留可重复的 CPU 诊断入口，原始日志/二进制不进入 AgentDocs。

Profiler 下 CPU median/P95 从 pan 139.2/160.9、zoom 181.2/222.6、rotate 179.1/210.6 ms，
降至 16.0/21.0、18.3/26.4、16.0/20.3 ms。180 帧内 evaluateProperties self time
从约 12.2 s 降至 34 ms；保留当前可见 anchors 的连续 size/paint、重排和逐 glyph collision。
预过滤后缓存 tile/integer layout、路径/anchors、编码坐标与 shape keys，离屏候选不求 fractional paint。
直接以已知 eye distance 调用 frustum.getPixelDimensions，避免 heading 引入虚假的 style zoom 变化。
几何按每个 style layer 的真实属性值失效；feature-independent fill/line paint 用 constant attributes
更新，保留 normalized byte color。圆角保留原 0.25 CSS pixel chord error，半径超界需替换的 batch
在上传预算允许前继续使用旧 paint；失败只销毁新建资源，pick/depth 重放上一正常帧。

另在应用浏览器独立标签页关闭 Profiler，使用相同 viewport、相机、可见数据和轨迹验证：

| 操作 | 修复前 FPS | 修复后 FPS | 修复前 CPU median/P95 (ms) | 修复后 CPU median/P95 (ms) |
| ---- | ---------- | ---------- | -------------------------- | -------------------------- |
| 拖动 | 7.5        | 55.5       | 129.1 / 158.4              | 16.0 / 25.0                |
| 缩放 | 5.6        | 43.6       | 170.6 / 214.2              | 18.0 / 54.8                |
| 旋转 | 6.0        | 55.6       | 165.3 / 178.0              | 15.6 / 22.9                |

每段结束均为 437 draw commands、686 candidates / 286 placed，0 truncated / failures；
HAR 重放的 glyph ranges、CPU bytes、texture bytes 也相同。已查看修复前后相同相机的截图，
道路、面填充、沿线文字和图标一致；没有降低密度、停用交互标注或改用地图颜色 RTT。
Headless Profiler 的调度开销不作为应用 FPS。上述是固定 warm workload，不能推广为所有视角恒定 60 FPS；
新瓦片/字体加载、更密集数据和几何分档切换仍可能产生峰值，保留 V5B-R07 的后续性能范围。

## Distant-label readability

负责人要求隐藏浅俯角挤在地平线的远处注记。V5B-R12（medium，fixed，execution）：
Projection snapshot 计算透视 anchor 的相对深度上限，超过视轴地面参考距离四倍的整组候选
在 glyph/sprite 需求、shaping、collision 和 pick IDs 分配之前剔除。对应地面投影比例低于中心 1/4；
不修改 style zoom、mixed SSE、底图或 Camera far，正交与同平面俯视不应用额外距离裁切。
完整 glyph 不按该界线裁剪；尚未增加渐隐或公开配置，不宣称 MapLibre 的距离显隐规则。

实际应用浏览器、1308×900 CSS、DPR=1、Berlin Bright、5°、zoom 12.049935656442358：
同一相机前后都是 64 rendered tiles / 68 resident，候选从 859 降到 333；
剔除 34 个已放置的远景标注（包括 Oslo、Stockholm），近处 87 个标注保留。
最大已放置相对深度从 96.42 降到 3.89，glyph ranges 从 4 降到 3，tile/symbol failures 均为 0。
已查看前后画面，地平线不再有遥远城市名一字排开，近处地名、道路名、路牌及地图保留。
相同 60 帧横向小幅移动的 CPU median/P95 为 24.0/31.6 → 22.2/33.0 ms；
这次筛选的主要证据是可读性及候选/资源减少，P95 未改善，不将其描述成普遍的帧率提升。

新增 Specs 验证远景不发出新 glyph range 请求、不生成 pick ID，接近后真实像素与拾取恢复，
移远后释放旧 pick ID；另验证正交与俯视。20 项 symbol Specs 通过。
本轮 6 项公开页/点标注/沿线 E2E 全通过，包含 5° 地图覆盖、保留近景标注、远景深度上限，
以及既有 tilt/heading/zoom、实际 alpha pick、DPR 与重建；未重复运行无改动的 3 项基础城市 E2E。
初次测试曾命中过期 engine Specs bundle，结果不计入本轮资格；根混合 bundle 的 private/public
重复 runtime 也不作为 workspace 资格。已明确先 `npm run build -- --workspace @cesium/engine`，
再运行 workspace Specs，并将命令记录到 Test README。开发服务器旧内存 bundle 已通过重启清除，
随后确认实际服务包含新规则再做画面和性能验证；未修改上游构建或测试入口。

## Delivery gate

最初追加公开页帧率诊断（已由下述原生面板替代）：每秒统计实际 postRender 次数及 preRender → postRender CPU 均值，
显式持续渲染开关可恢复按需空闲；后台不累计，pagehide 释放事件/计时器，保留 BFCache 规则。
3 项公开页本地 E2E 通过，新增验证实际连续绘制与回到 0 FPS 空闲；也修正 60 帧测量结束后
按钮等待额外一帧才重新可用的事件顺序问题。ESLint 通过；无 engine/Shader 修改，
不重复全量构建或 vector Specs，不据此宣布密集地图性能达标。
当前在线南京视图一次静止持续渲染采样：1141×1150 CSS、zoom 15.33、11 visible、
654 commands、389 placed，60.0 FPS / CPU 4.5 ms；测量后恢复按需模式。
这只说明该静态时间窗，不覆盖交互重排或新数据加载卡顿；修改范围格式和 Markdownlint 通过，
全 AgentDocs Prettier 保留相同的 233 份既有文件告警。

负责人最新要求采用 Cesium 原生行为：公开页删除 `requestRenderMode: true` 与
`maximumRenderTimeChange`，使用 Viewer 默认持续渲染并开启 `debugShowFramesPerSecond`。
已移除自定义 FPS / CPU 面板、计时器、开关及其诊断 getter；60 帧 CPU 测量仍独立保留。
原生 MS 是帧间隔，不将它解释成 CPU 提交时间。更新后的 3 项公开页 E2E 全通过，
覆盖原生 FPS / MS 输出、默认持续渲染及既有 tilt/pick/recreate；ESLint 与修改范围格式通过。
本次仅 Test 组装与 E2E / 文档变化，复用此前 engine 资格，不重复运行 engine Specs 或构建。

V5B-R13（medium，deferred，architecture）：浅俯角下远景选取的工作量仍大，
需要在共享平面选择层约束细节范围；当前远景 symbol filter 不减少地图请求。
静止 5° 视图已观察到请求收敛，不能将移动卡顿直接认定为静止无限加载。
源码审计、测量及建议见[远景加载讨论](../discussions/2026-09-13-planar-distant-tile-loading.md)。
负责人已批准共享远景处理，并明确只优化低角度倾斜、保持俯视拉远行为；
由后续独立共享选择层阶段实现，继续保留此未解决项与讨论链接。

本轮 upstream-owned files：无；SGP：无新增；生成文件不提交。
V5A 已独立提交 `50ab83b96f`；当前 V5B gate 按负责人继续授权关闭，形成独立本地 checkpoint。
能力、限制和验收入口见 [VectorTileSymbols](../../../Documentation/SceneGIS/VectorTileSymbols.md)。
