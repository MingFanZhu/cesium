# 平面局部行星大气技术评审

- Type：implementation / architecture self-review
- Status：withdrawn；负责人否决高空几何边界，已完成撤销；两项像素 fixture 失败 deferred
- Owner：当前任务，Architecture / execution
- Created / Updated：2026-10-20
- Target：[standalone plan](../plans/2026-10-20-planar-local-planet.md)
- Decision：ADR-0170；upstream-owned files / SGP 增量均为无

## 实现

2026-10-20 负责人要求回到严格平面；局部球壳与平面地表在高空不一致不适用于常见 GIS 视角。
相关 API、Shader、资源/材质分支、专用测试和示例切换已移除，原严格平面渲染路径恢复。
此前有效的自动曝光、雾 source domain、方向性多次散射与其测试保留。
下文记录撤销前的实现和证据；此前云与较宽检查失败仍保留历史，不代表此次撤销验证结果。

新增构造选项及可写 `planarAtmosphereModel`：`flat` / `local-planet`，默认 `flat`。
几何仍为 Planar，局部球心跟随相机水平投影，米制绝对 Z 不变。已有 double precision
camera-relative frame 消去 XY 大坐标；天空和有限接收段按球壳真实入口/出口裁剪，
不增加 raymarch、俯角阈值、密度或颜色补偿。实际平面深度与法线保留。

复用 BrunetonEarth 三资产及 Globe 方向照度 atlas。天空、空气透视、地表、模型、矢量、
反射和星光消光使用所选模型。切换加载期间显示上一完整代，候选成功后发布模式和纹理；
过时代请求丢弃，旧纹理释放。失败沿用 errorEvent / fail-closed，显式切回已保留模型可恢复。
材质共享库通过 uniform 随完整 lighting record 切换；环境 fullscreen / cloud / stars 程序
按模型编译，strict flat 不引入球面库。反射按既有 resource identity 失效。

综合示例“天空与光照 → 平面大气几何”增加切换；球面页显示但禁用该控件。
初始值、重置值、物理系数、白平衡、曝光、平面 SSE / 瓦片调度均不改变。
先前自动曝光、雾和方向散射工作区修改保留。

## 验证

- `npm run test -- --includeName 'local-planet'`：最终 2/2 SUCCESS。
  实际 WebGL 证明模式/资源一致、过时请求取消、warm reuse、失败一次上报、切回恢复、
  资源销毁、与 Globe 辐亮度/方向照度对照、真实 material helper 的直接与间接光源接入；
  120 km / 1000 km 球壳区间、未到介质接收点、真空射线及有限输出；
  原点、南京 XY 和 ±1e9 m XY 下实际背景像素完全相同，资源身份保持不变。
- `npx playwright test --config Test/playwright.examples.config.mjs --grep 'Planar local-planet switch'`：
  1/1 passed。真实 GUI 双向切换，atlas 649↔64，初始 flat、相机不动、销毁无 pageerror。
  初次测试误把 lil-gui 的中文 DOM value 当成 API 值，已分别断言 UI 和 API，未修改产品迁就测试。
- `npm run build`、`npm run build-release`、`npm run build-ts` 和
  `npx tsc --noEmit -p Specs/TypeScript/tsconfig.json` 通过。类型构建保留已有 upstream JSDoc warnings。
- Scoped ESLint / Prettier、此次新增文档 Markdownlint 和 `git diff --check` 通过。
  所有权审计确认 upstream-owned / generated 文件变更均为零；无新资产、生成器、构建器或 package manifest。

## 运行与视觉证据

两页相同相机经纬度、706.353 m、ENU direction/up、FOV，中午北京时间 2026-10-20 12:00。
HDR、PBR Neutral、手动 exposure 1，关闭高度雾、云、泛光和自动曝光；天空/空气/地表倍率
分别 2.5/1/1.2，距离倍率 1。局部模式天空的平面粉色带减弱，地表仍有原有材质和大气颜色。
Globe 与 Planar 几何和天文参考点细节不同，不声称逐像素一致或负责人已验收。

1001×826、RTX 3060 Ti / ANGLE，实际两遍 Shader、固定相同输入、交替各 24 samples：

| GPU pass   | flat median / P90      | local-planet median / P90 |
| ---------- | ---------------------- | ------------------------- |
| Background | 0.060416 / 0.064512 ms | 0.151552 / 0.160768 ms    |
| Aerial     | 0.041984 / 0.045056 ms | 0.098304 / 0.099328 ms    |

两遍 median 合计 0.1024→0.249856 ms；不是整帧或所有材质耗时保证。
GL error 0，无 timer disjoint，所有临时 query / texture / FBO / program 释放。
新模式 LUT 常驻 9,931,904 bytes，strict flat 8,527,872 bytes，增加 1,404,032 bytes（约 1.34 MiB）。
没有逐帧 LUT 构建。一次 localhost、已有浏览器/驱动缓存的完整 flat→local 切换到可见为
355.8 ms，包含加载、创建 atlas 和发布；不是无缓存冷启动基准。

121 帧连续运动覆盖约 706 m–1000 km、俯角约 1.7°–86°、XY 各 ±4000 / ±2500 km，
资源身份不变、ready 稳定、renderError 空、GL error 0。120 km 低俯角截图同时暴露几何限制：
远处平面伸出虚拟球壳，地平线依然平直，局部地图/底色过渡不是球面轨道外观。
不能把数值连续或无错误解读成高空视觉完全正确；不以雾遮盖此限制。
证据保存在忽略目录 `Build/planar-local-planet/`。

## 未闭合与范围

- 用户中途明确暂不处理云。本轮不对云效果或云性能作验收结论。已保留必要的所选资产采样兼容，
  不为云展开优化。早期含 warm-cloud fixture 的组合运行在两个核心测试通过后超时，出现
  afterAll poll 的失效引用；未取得完整通过，不能把后来的 2/2 当作云回归通过。
  最初双模型共存的云程序有明显冷编译等待，已改为模式专用环境程序，但超时根因未最终隔离。
- 并行构建曾遇 Windows VirtualAlloc errno=1455 内存不足；失败测试构建清除了开发 bundle，
  导致较宽示例测试的 Planar 页面未启动（Globe 子测试通过）。只结束本任务残留验证进程，
  顺序重建后核心 Specs 与专门切换 E2E 通过；不宣称完整综合环境矩阵通过。
- 新模式是随相机平移的局部近似，固定远景的光学高度会连续变化；高空平面与球壳不重合是明确边界。
  最终保留哪种模型由负责人继续对照决定，默认值保持原状。
- 本记录为自审，未调用独立 Agent。未提交、未推送。

## 撤销验证（2026-10-20）

- 源码和例子中的 `planarAtmosphereModel`、局部球壳 helper、uniform / define / asset 分支均已移除。
  Renderer、天空反射、矢量/平面光照及纯模式 Shader 恢复为 HEAD 原实现；
  Controller 与雾 Shader 仅保留此前独立修复的 source-domain 修改。
  ADR-0170 标记 withdrawn，Architecture / ADR-0042 撤除例外；原评审保留。
- 相关 Specs 实际执行 3 项：有限 Planar 端点 / slab 出口 1 项通过；
  outside-slab background、horizontal / shallow / high-outside aerial 两项未通过。
  前者背景像素均为白色，后者介质与 identity 输出无预期差分。
  **P2 / deferred / Owner：环境维护**。本轮未证明其失败根因，不能直接称为已确认基线缺陷；
  不改容差或删除既有断言，也不把测试进程 exit code 0 视为测试通过。
  后续维护需独立隔离 framebuffer / frame-state 与介质程序调用，保留此 finding。
- 专门的综合示例 E2E 1/1 passed：1000 km 高度、64×16 照度 LUT、环境开关不换资源、
  销毁释放 scattering texture、没有模式选择控件和 pageerror。
- 首次 Specs 构建因生成 barrel 仍引用被删 helper 而失败，正常 `npm run build` 重建后解决；
  未手工修改生成文件。一次选择器缺少正则分隔符执行 0 项，不计为通过；
  改正后取得上述 1 passed / 2 failed 的实际结果。证据在 `Build/strict-planar-restore/`。
- `npm run build`、`npm run build-release`、`npm run build-ts`、TypeScript `--noEmit` 检查通过，
  类型生成保留已有 upstream JSDoc warnings。Scoped ESLint / Prettier 与 `git diff --check` 通过。
  生成导出 / 类型中已无模式 API 或 helper；不手改、不追踪生成文件。
- 当前 Planar 页已刷新，并恢复刷新前最新的约 193.65 km 相机、时钟与环境设置（关闭雾与云）；
  ready、无 error、17 个矢量瓦片 / 64 个标注 / 0 失败，照度资源为 64×16。
  不将此页面检查替代未通过的两个像素 fixture；原严格平面地平线颜色特性保留。
- 所有权复核：upstream-owned files 为零，SGP 增量为零；2026-10-20 按负责人后续要求独立提交撤销记录与高空回归，未推送。
- 全量 AgentDocs Markdownlint 通过；全量 Prettier 仍报告 451 个原有文件格式警告，
  本轮改动文档格式通过，未扩大到无关文件格式化。
