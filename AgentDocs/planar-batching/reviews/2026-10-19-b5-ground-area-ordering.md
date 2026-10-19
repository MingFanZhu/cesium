# B5 非连续贴地面合批 review

- Type: architecture / code review
- Status: approved
- Owner role: architecture（当前任务自审，未启用独立 Agent）
- Created / Updated: 2026-10-19
- Target: [B5 plan](../plans/2026-10-19-b5-ground-area-ordering.md)
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## 实现与审查

在创建内部 Primitive 前按 XY 相交前驱的最大层号分层，按层重排 GeometryInstance 与 extents。
原生 combine 生成真正连续的索引范围，既有 stencil/fill planner 可合并原输入中不连续的对象。
重叠对的偏序全部保留；同层互不相交，不依赖当前 color/show。内部顺序不回写公开构造快照。

RBush 只移除被新 extent 完全包含的前驱：后继节点层号更高且覆盖旧节点范围，因此未来相交约束不会丢失。
部分相交不能删除；无需存储所有相交边。高度重叠但互不包含的输入仍可能有二次查询工作量，不承诺线性复杂度。
原生索引 uint guard、场景深度/拾取 Shader、VA 和 candidate/current 所有权维持既有协议。

## Findings

| ID    | Severity | Status | Evidence / disposition                                                                                                                     |
| ----- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B5-R1 | high     | fixed  | 忽略前驱先后关系的 first-fit 会把 A/C 合组，即使 A→B→C 必须顺序覆盖。分层保持每个相交前驱约束，链式透明/不透明像素与拾取通过。             |
| B5-R2 | high     | fixed  | 原 pick offsets 已跟随 native 实例顺序，颜色查询若仍按外部序号读取会失配。commands 改用同序业务 ID，独立改色/显隐、混色与重建 Specs 通过。 |
| B5-R3 | medium   | fixed  | 闭包保留内部 GeometryInstance 会延长 volume buffers 的寿命。只传轻量 ID 数组，原生 geometryInstances 释放断言与 VA 销毁通过。              |

## 验证证据

- 先在 B4 实现复现 1024 面、512 个双层栈：render/pick 各 513 对命令。B5 各 2 对（4 条）。
- Ground 30/30；DataSources 102/102。传递相交链、部分覆盖保留前驱、透明叠加与混合不透明覆盖通过。
- 独立 ID、隐藏后下层拾取、属性变更、重建、warm VA/command、释放与失败原子性通过。
  8192 个完全重叠实例、同色 stencil 容量及此前低视角/坡面/孔洞回归通过。
- Chrome Headless 155 / Windows 10，1280×900、DPR 1：检查合批和隐藏截图；四个采样点的 RGBA/ID
  与逐对象基线完全一致，点击 553 改白、隐藏后拾取 552，页面错误 0。
- 同次浏览器、相同数据：逐对象到 B5 合批，Primitive/VA 1024 → 1，业务 render 命令 2048 → 4。
  CPU 首次构建/提交 171.4 → 26.8 ms；20 warm frames median/P95 13.2/14.7 → 0.6/1.0 ms。
  这是本机 CPU 耗时，不是 GPU 完成时间；与旧合批的比较依据是上面的失败/通过 Specs 命令数。
- 开发构建、ESLint、diff whitespace 检查通过。公共 API、Shader 和打包配置未变，此阶段未重复全量 release/types/package 验证。
- AgentDocs 全量 markdownlint 通过；全量 Prettier 仍有 452 个既有文件，本扩展及本次修改执行 scoped 格式检查。

## 结论与剩余边界

Phase gate approved；无未处置 finding，形成独立本地提交。
完全重叠的异色/透明面仍需有序分组；bbox 相交但轮廓实际不交的面仍保守分开。
命令数按 VA、terrain pass/frustum 执行，不含场景共有 depth copy/resolve。
同步构建、整批剔除和 Entity 不自动合批的边界不变。
upstream-owned files=0，SGP=None；生成物不提交。
