# 平面地形深度测试技术自审

- Type: review
- Status: approved
- Author role: Architecture / implementation self-review
- Date: 2026-10-23
- Target: [standalone plan](../plans/2026-10-23-terrain-depth-test.md)
- ADR: [ADR-0185](../../../Documentation/SceneGIS/Decisions/ADR-0185-planar-terrain-depth-test.md)
- Upstream-owned files: `packages/engine/Source/Scene/Scene.js`
- SGP: SGP-0001；复用现有 primary-world 集成目的

## 结论与 findings

属性及颜色/ID picking/贴地/透明/注记集成已完成；默认 true 保留现有平面遮挡。
没有本增量未解决的产品正确性 finding；2026-10-23 负责人确认视觉验收通过。

| ID    | Severity | Finding / evidence                                                         | Owner        | Status / follow-up                                                                                                                                                                                  |
| ----- | -------- | -------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TD-01 | P2       | 只增加 World 属性不会影响 Scene 的 Globe-only clear 分支                   | Execution    | fixed：Scene 接入显式 false，flat/heightmap 的像素、ID pick 与恢复检查通过；Globe DepthPlane 仍只用于 Globe                                                                                         |
| TD-02 | P2       | 多视锥透明深度恢复仅识别 Globe，会重新遮挡平面地下对象                     | Execution    | fixed：恢复前跳过 -5 地表，保留普通对象和负 tag 注记；linear sorted 与 logarithmic OIT Specs 通过                                                                                                   |
| TD-03 | P2       | Billboard 独立读取地形深度纹理，跨视锥 annotation guard 也会额外遮挡       | Execution    | fixed：仅对非 Globe 的原生 Billboard/Label 缓存命令适配 coarse-depth uniform；guard 区分实际地形与实体/注记。单/多视锥颜色和 pick Specs、8 项既有注记回归通过                                       |
| TD-04 | P3       | 既有 Globe 云测试在 spyOn cloudCommand.execute 时对象不存在                | Architecture | deferred：原提交 Scene.js/RestoreDepth 源码下同一测试复现；与本开关无关。后续按 [deferred-renderer handoff](../../webgl-deferred-renderer/README.md) 独立维护测试冷加载时序；本轮不修改该测试或产品 |
| TD-05 | P3       | 原生单视锥 pickPosition 合并地形与实体深度，可能返回地表而不是更远地下对象 | Architecture | accepted：保留原生 PickDepth 行为；API guide 明确不承诺地下坐标穿透拾取，专项 Specs 锁定此边界                                                                                                      |

## 验证

Windows / Chrome Headless 155 真实 WebGL；专项不使用 WebGL stub。

| Check                       | Result                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SceneGISPlanarDepthTest     | dev 7/7；release 7/7                                                                                                     |
| SceneGISPlanarWorld         | 27/27，含默认、更新、invalid atomicity 与资源边界                                                                        |
| SceneGISWorld               | 27/27，既有 custom world 无需新增必需属性                                                                                |
| SceneGISPlanarGroundBatch   | 21/21                                                                                                                    |
| SceneGISDeferredAnnotations | 8/8                                                                                                                      |
| SceneGISDeferredGlobe       | 30/31；TD-04 在原源码复现同样失败                                                                                        |
| Browser E2E                 | dev / release 2/2；真实 checkbox、像素、恢复及截图                                                                       |
| Build / types               | npm run build、build-release、build-ts、tsc 全部通过；类型生成包含 boolean 属性                                          |
| Static / ownership          | 变更 JS/HTML ESLint 与 Prettier、diff check、upstream audit 通过；当前交付仅 Scene.js 为 upstream-owned；生成物 status 0 |
| AgentDocs                   | 全量 Markdownlint 通过；全量 Prettier 报告 565 个既有范围外文件，本次索引/plan/review 定向检查通过                       |

Globe 失败测试名称为 `uses complete deferred depth for advanced aerial perspective and cloud receivers`。
原源码定向运行 1/1 失败，位置仍为 cloudCommand 的 spyOn；已恢复当前源码后完成最终构建。
build-ts 有既有 TSD-JSDoc warnings，命令和 tsc 均成功，没有编辑生成声明。

浏览器使用 Playwright Chromium headless shell / OpenGL，960×640。full Chromium channel 在本机出现
WebGL 构造或截图协议失败，改用已有 headless shell 完成验证；没有产品 fallback、retry 或测试专用产品分支。
已检查两张 dev 截图：开启时地下红盒隐藏，关闭后显示；蓝盒保持对后方对象的遮挡。

## 资源与性能

同一确定性 heightmap、相机和两个 Box，各开关状态记录 30 次 CPU render 提交时间。

| Build   | true median / P95 | false median / P95 |
| ------- | ----------------- | ------------------ |
| dev     | 0.4 / 0.5 ms      | 0.4 / 1.2 ms       |
| release | 0.4 / 0.9 ms      | 0.5 / 0.6 ms       |

仅作同机提交时间观察，不是 GPU 完成时间或提速声明。两种状态均为 3 个 material draws、
2 个 lighting draws、22,118,400 bytes deferred storage；材质纹理与地表 command identity 不变。
destroy 后材质纹理和 World 均已销毁，GL error=0。原始日志、截图、measurements 留在忽略的 Build/Specs。
Billboard command / uniform map 为实例 WeakMap 缓存；没有新增 GPU 分配、geometry replay 或 shader 变体数量。

## 交接

示例：[地形深度测试](../../../Test/地形深度测试.html)。负责人于 2026-10-23 确认人工验收通过，
并要求在 scenegis/develop 形成独立本地提交；未要求推送。既有影像分屏等未决视觉事项不由本轮关闭。
若需要地下对象的精确坐标交互，应独立设计，
不能从本属性推导出 pickPosition 的穿透承诺。
