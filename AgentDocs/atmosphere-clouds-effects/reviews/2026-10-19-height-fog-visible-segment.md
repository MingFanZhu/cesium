# 高度雾完整可见段积分评审

- Type: technical review / self-review
- Status: technically verified；负责人视觉验收待定
- Author / Owner: 当前任务，Architecture / execution
- Created / Updated: 2026-10-19
- Target: [standalone plan](../plans/2026-10-19-height-fog-visible-segment.md)
- ADR: [ADR-0045 修订](../../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md#2026-10-19-完整可见段积分修订)
- Upstream-owned files / SGP delta: none

## 发现与处置

### HF-001 — 高空长斜射漏掉近地雾（P1，fixed）

原实现将 Globe / Planar 的雾层内积分长度限制到 300 km。当前场景相机高度
336250.432 m，在屏幕 `(500, 285)` 的地表射线，完整入层段约 534.6 km；旧截断点
仍约 20.9 km 高，遗漏主要密度。独立积分得到 raw fog amount 约 0.39468，旧段约
0.00538。这是地平线下方清晰地表带的直接原因，并非天空大气环与地球错位。

修复移除固定长度 cap。Globe 使用完整段长度计算可忽略尾部的高度上界，裁剪后
仍执行原有 16 点 Gauss-Legendre 求积，均匀密度使用解析长度积分；Planar 保留
解析积分。尾部省略的光学厚度总和有 `1e-7` 上界，不等同于求积总误差保证。
球壳求交保留切线两侧，地表深度 / support / start distance 仍决定几何范围。
默认参数、光照代表点规则、合成与阴影规则均未改变，无俯角补偿。

### HF-002 — 长段固定采样的精度与成本（P2，fixed）

仅移除 cap 会把有限节点分散到高空稀薄区域，因此保留固定预算并按误差上界
集中到实际有贡献的高度。真实 GPU 执行产品 GLSL 数值函数，对比独立双精度
8192 区间 Simpson 积分。参考积分覆盖整个几何段，不复用产品的尾部裁剪。

`SceneGISHeightFogSpec.js` 的 3 项测试合计 269 条射线：当前长斜射、Planar
900 km 水平 / 高空斜射、切线两侧、薄雾、均匀雾、有限接收距离、零密度、
base height 极值、start distance，以及连续高度 / 倾角。Float32 输入与 GPU 上传
一致，所有非饱和 fog amount 绝对误差小于 0.005；参考 tau 在 `[1e-4, 20]` 时
相对误差小于 2%。结果 finite，fixture 的 texture / FBO / program 均正常释放。

原产品 Shader 下新增回归失败；修复后的最终源码通过。没有增加采样数、纹理
查询或持久资源，已有阴影子段调用仍分别遵守每次最多 16 次密度采样的预算。

## 验证证据

本地证据统一保存在忽略目录 `Build/height-fog-fix/`，不作为仓库生成物提交。

| 检查                                                                                                                         | 结果与对应风险                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `npm run build`                                                                                                              | 通过，重新生成 GLSL 模块与实际页面使用的 dev bundle |
| `npm run test -- --production --includeName SceneGISHeightFog --browsers ChromeHeadless --webglValidation --failTaskOnError` | 最终 3/3 通过；覆盖完整段、求积精度与连续运动数值   |
| 同一命令，`--includeName "keeps height fog bounded"`                                                                         | 1/1 通过；原 shader contract 保持，旧 cap 断言替换  |
| 同一命令，`--includeName "updates all height-fog controls as warm uniforms only"`                                            | 1/1 通过；参数变化不重建资源                        |
| 两个改动 Spec 的 ESLint                                                                                                      | 通过                                                |
| scoped Prettier / Markdownlint、AgentDocs 全量格式检查                                                                       | 见下方格式检查记录                                  |
| ownership / generated audit、`git diff --check`                                                                              | 见最终收口记录                                      |

实际页面采用 ArcGIS World Imagery / Cesium World Terrain，1001×826，原时钟暂停、
默认雾参数、clouds off。`before.png` / `after.png` 保留相同相机、时刻和图层，
地平线下方的漏雾带已消失。按 postRender 逐帧改变相机，高度 20～1000 km，
倾角 -0.2～-0.85 rad，保留 `height-20km.png`、`height-1000km.png`、
`tilt-shallow.png`、`tilt-down.png`。高度及浅倾角扫描共 240 帧的返回记录无
render error，环境资源 identity 不变；后续 120 帧俯视扫描的 CDP 汇总返回超时，
完成终点另行读取确认并留图。连续输入的数值精度由上述独立 GPU 回归覆盖。
页面最后恢复原 position / direction / up，原时钟、图层、雾密度和 falloff 均保留。

GPU timing 使用页面实际 Aerial 输入、LUT 与 viewport；两个临时程序仅替换高度雾
library，交替顺序各测 24 次。RTX 3060 Ti / ANGLE D3D11：旧 median
0.121856 ms / P90 0.123904 ms，新 median 0.128 ms / P90 0.130048 ms，
中位增加 0.006144 ms（约 5%）。query 无 disjoint，GL error 为 0，页面资源
identity 不变；临时程序、附件与 query 已释放。该值只代表本场景的 Aerial pass，
不代表整帧性能或其他 GPU。详见本地 `profile.json`。

## 最终收口记录

改动范围内 JS / Markdown 的 Prettier 与 Markdownlint 通过。按 AgentDocs 规则
执行的全量 Markdownlint 通过；全量 Prettier 仍报告其他 452 个既有文档的格式
问题，本次修改文档均通过，不进行无关批量格式化。GLSL 使用现有格式，实际构建
和 strict-WebGL 编译通过；仓库没有 GLSL Prettier parser。

`git diff --check` 通过，只有工作区 LF / CRLF 提示。逐路径对照官方基线
`6d5d8b1f0725b6f831b336463f4b11c98023427b`，所有本次改动路径均不属于
upstream-owned files；未修改补丁清单，无 SGP 增量。工作区不包含待提交的生成文件。
本次不涉及公共 API、类型或发布边界，不运行无关全量类型 / 发布检查。

## 范围和剩余风险

- 产品改动仅 `SceneGISExponentialHeightFog.glsl`；测试新增
  `SceneGISHeightFogSpec.js` 并更新现有 `SceneGISEnvironmentEffectsSpec.js` 的 cap contract。
  文档为 ADR、standalone plan、评审与扩展索引；无 upstream-owned file / SGP 变化。
- Globe 继续采用既有 virtual-sphere reference，未改变真实地形与虚拟球壳近似；
  雾光照仍使用可见段代表点，未扩展为逐样本散射积分。
- 本次不宣称完整环境 strict-WebGL suite 通过；既有背景 fixture 问题继续保留在
  [前次评审](2026-10-15-planar-high-altitude-precision.md)，由环境维护负责人后续处理。
- 技术自审未发现新的未解决实现项。负责人负责当前画面的最终视觉判断；
  2026-10-19 负责人要求将已验证修复形成独立本地提交，不推送；视觉反馈不由自动化替代。
