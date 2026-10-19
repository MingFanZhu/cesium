# B6 安全范围放宽 review

- Type: architecture / code review
- Status: approved
- Owner role: architecture（当前任务自审，未启用独立 Agent）
- Created / Updated: 2026-10-19
- Target: [B6 plan](../plans/2026-10-19-b6-safe-footprint-batching.md)，基于 `9e65a8a8f9`
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## 实现与审查

RBush 继续负责 broad phase。对内部相交的 bbox，只在其交叠矩形与双方填充区域均为空时解除冲突；
环边/矩形 SAT 加包含奇偶判断覆盖凹面与孔洞。边界接触和舍入量级的不确定性保守保留冲突。
同 bbox、包含和实心矩形可以提前确定冲突，避免无收益的轮廓扫描；未引入 triangle tree 或一般 polygon/polygon 相交。

按最高 layer、同层最后原始 index 选取冲突前驱，native combine 前按 layer 排序后映射其索引。
一个连续 range 内有冲突，当且仅当最后冲突前驱落入该 range。只保留最后前驱即可取代原 commands 中重复的空间查询。
前驱剪枝必须证明新对象覆盖旧 bbox 和填充区域，才能把所有未来约束传递给层号更高的新对象。
仅接受 geometry identity、完全相同的 XY rings 或实心矩形包含；不使用一般凹面 bbox 包含剪枝。

渲染/拾取按同一空间约束分组；原有最多 15 个同色不透明闭体的 render 例外保留。
公开输入顺序、原生 BatchTable/ID/attributes、VA/index、深度/模板状态及 Shader 均不变。
commands 仅保留 IDs 和 O(N) 数字数组，不持有几何 buffers、空间树或完整对象对缓存。

## Findings

| ID    | Severity | Status | Evidence / disposition                                                                                                                                             |
| ----- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B6-R1 | high     | fixed  | B5 的 bbox 包含剪枝不能沿用：凹面 bbox 覆盖早先小面但真实轮廓未覆盖，后续面可能仍只与早先小面冲突。收紧剪枝；该三对象反例及同 bbox 不同轮廓反例通过。              |
| B6-R2 | medium   | fixed  | 仅 identity 剪枝导致独立 geometry 对象的相同凹面积累重复候选；2048 对象分组约 44.5 ms。严格逐环逐点 XY 等价剪枝后约 2.6 ms，Z 不影响贴地 XY 约束；不同轮廓不删除。 |
| B6-R3 | medium   | fixed  | 属性标脏时若重做精确相交会把静态开销带入交互。静态规划返回最后冲突前驱，render/pick/改色显隐只比较索引；warm VA/command 与独立属性回归通过。                       |

## 验证证据

- B5 先失败复现 1024 个共同空区凹面仍需 4 draw；B6 render/pick 各 2 draw，颜色、隐藏与拾取独立。
- Ground 39/39，DataSources 102/102；包含合法/反例、孔洞、斜边、边界接触、大坐标、两种绕向、传递约束及既有资源生命周期通过。
- 真实 heightmap、±80 m 包络，90°/25°/5°、linear/log depth：两面内部和共同空区的 RGBA/ID 与逐对象基线一致。
  既有混合不透明覆盖、透明叠加、隐藏后下层拾取、孔内独立面、坡面低视角和 8192 实例回归通过。
- Chrome Headless 155 / Windows 10，1280×900、DPR 1：示例截图与隐藏截图检查、对象 553 拾取/改白、隐藏后无 ID，页面错误 0。
  另以 ±80 m 包络在 5° 下截取同一对凹面的合批/逐对象画面，轮廓与共同空区一致，命令分别为 2/4。
- 同一浏览器内交替 B5/B6，3 次预热、7 次测量；构造与首次提交中位数：1024 安全凹面 16.8/16.3 ms，8192 共享重叠凹面 112.8/109.9 ms。
  前者命令 4→2，后者仍 1094（同色不透明最多 15 个闭体的既有上限）。仅证明两个样本未见明显构建回退，不是 GPU 完成时间或通用提速承诺。
- B6 20 warm frames median/P95 为 0.3/0.9 ms。独立相同轮廓的 2048 对象分组单独计时，不与完整浏览器构建混用。
- 开发构建、类型生成、engine tarball 导入/构造/生命周期、ESLint 和 TypeScript 检查通过；没有更改公共 API 或打包配置。
- AgentDocs 全量 markdownlint 通过；全量 Prettier 有 452 个既有文件待格式化，本扩展及本次修改的 scoped 格式检查通过。

## 结论与剩余边界

Phase gate approved；无未处置 finding，形成独立本地提交。
孔内独立面和普通凹槽内的小面不能因此合组；真实重叠的透明/异色面保持顺序隔离。
高顶点、密集候选且无法证明包含的输入仍可能产生二次构建工作量，不承诺线性复杂度。
不增加俯角开关；命令数按 VA/pass/frustum，整批剔除、同步构建与 Entity 不自动合批的边界不变。
upstream-owned files=0，SGP=None；生成物不提交。
