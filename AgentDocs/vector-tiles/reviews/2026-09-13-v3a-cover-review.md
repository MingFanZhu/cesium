# Review: V3A 有界瓦片替换

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审；不是独立评审
- Created / Updated: `2026-09-13`
- Review target: `feature/vector-tiles`，V2 checkpoint `a6e4383cfc` 后的 V3A 工作区
- Related plan: [V3A](../plans/2026-09-13-v3a-streaming-cover.md)
- ADR: [ADR-0060](../../../Documentation/SceneGIS/Decisions/ADR-0060-vector-tile-resident-render-cover.md)
- SGP: None（本阶段无 upstream-owned 修改）

## Scope and conclusion

Desired selection 与 resident render cover 分离：exact、最近 ancestor、无重叠 descendants。
每区域使用独立裁剪命令，借用同一 batch 的 geometry/VA/Shader/pick identity；
保持 style layer 全 tile 顺序、半开覆盖和 normal-render publication。
请求、上传和 cache count 仍受原预算约束，合法空数据替换旧覆盖，失败保留已知数据并显式报告。
Test 增加真实 PBF 的延迟完成演示，没有产品测试分支或地图颜色 RTT。

技术自审通过；项目负责人于 2026-09-13 明确确认“通过”，本阶段逐块替换视觉 gate 关闭。

## Findings

| ID      | Severity   | Status   | Owner role                | Finding / evidence                                                                                       | Disposition / follow-up                                                                          |
| ------- | ---------- | -------- | ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| V3A-R01 | high       | fixed    | architecture/execution    | V2 pending desired 直接移除旧 cover；父子整块叠画会重复应用透明颜色                                      | 显式不重叠 region；多 style layer、部分到达、空 tile 和失败的真实像素/pick 回归通过              |
| V3A-R02 | medium     | fixed    | execution                 | camera Z=0 时旧 visible/render 与 4 个 pending request 保留，恢复后接收旧 completion；新增回归先复现失败 | 无视图与隐藏统一 clearView；清空发布、取消请求、恢复重新请求且忽略旧 completion，回归通过        |
| V3A-R03 | gate       | approved | architecture / 项目负责人 | 用户可见的加载过渡须由项目负责人确认                                                                     | 项目负责人于 2026-09-13 确认“通过”，本阶段视觉 gate 关闭                                         |
| V3A-R04 | limitation | accepted | architecture              | 没有已缓存祖先/后代，或 cache 无剩余 slots 时仍可能缺图                                                  | 保持公开硬上限，不主动请求祖先链；符合 ADR-0060，本阶段不增加 prefetch 或隐式预算                |
| V3A-R05 | limitation | accepted | architecture              | mixed LOD 截图的道路边缘存在量化造成的小幅位置差异                                                       | 只保证覆盖不重复，不承诺 LOD 几何一致或 cross-fade；记录用户视觉 gate 的实际边界                 |
| V3A-R06 | limitation | deferred | architecture/execution    | 常用 stroke/AA、任意 payload byte accounting、密集性能与生产 terrain 尚未实现                            | 分别由 [roadmap](../plans/2026-09-12-vector-tiles-extension.md) 的 V3B、V3C、V4 进入时审计和验收 |

## Validation reviewed

- Chrome Headless 152 / Windows：`SceneGISVectorTile` focused Specs **67/67**。
  原有 59 项全部保留，新增 pure selector 3 项、真实 Context 5 项。
  覆盖 partial arrival、两层 source-over、共享裁剪边、空 tile、失败、zoom-out descendants、
  cache 紧约束、camera style upload budget、隐藏/无视图、取消与过时结果。
- Chromium 151.0.7922.34 / Windows：本地页面 E2E **2/2**。
  保留 PBF/颜色像素/交互/倾斜/重建；新增等待中父级 pick → 部分替换 → 子级 pick。
  检查 ancestor 与 mixed LOD 截图：保持地图覆盖，无额外透明叠色；
  LOD 数据的细小几何跳动按 V3A-R05 保留，不把 Agent 检查替代用户视觉判断。
- 资源：region commands 借用同一 VA；clip uniformMap 按 region 分离。
  pick/depth 与 warm frame 不增请求/上传；hidden 后恢复缓存，移除销毁 VA。
  DrawCommand.shallowClone 不复制 derivedCommands，每个 region command 保留自己的派生缓存。
- Engine 构建、root 构建、完整 build-ts/tsc、build-release 通过。
  类型生成仍有既有 TSD-JSDoc warnings；无新公开构造选项，新增诊断计数已写入指南。
- 独立 engine tarball 安装、5 个公开入口、2 个固定生成 Shader、320-feature PBF 解码、
  strict NodeNext TypeScript 与 minified release CJS smoke 通过。
- 修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、8 份修改文档的 61 个相对链接、diff whitespace 通过。
  全 AgentDocs Prettier 仍报告 231 份既有文件格式问题，与 V2 已知基线相同；未格式化无关文档。
  上游审计通过：当前交付 upstream-owned entries **0**，generated status **0**。

## Performance evidence and limits

同 V2 的 Intel Core i5-12490F / Windows / Chromium 151，1280×800、DPR=1、开发 ESM、
本地 320-feature 城市。在中央街区保持 4 desired / 5 resident / 25 draw commands。
两个页面验证样本的 60 warm frames CPU 提交时间为：
median **0.9 / 1.1 ms**，P95 **1.3 / 1.8 ms**；V2 baseline 为 **0.8 / 1.3 ms**。
初次 ready 为约 **207 / 190 ms**（V2 约 176 ms），不含 runtime/style 下载。
第二次样本期间上游审计也在运行，不能把短样本差值归因为单一 renderer 改动。

新增 clipping 会让一个 ancestor 对多个 desired regions 各提交一次命令；GPU geometry 不复制。
页面最终 command 数与 V2 相同，Specs 确认 warm uploads 与资源身份不变。
这些是低密度回归观察，不含 GPU 完成/浏览器合成，不证明高负载性能或无开销。
V3C 再固定密集负载并以实测热点决定 byte accounting 和 Worker，不追加代理性能矩阵。

## Gate and handoff

V2 checkpoint `a6e4383cfc` 已建立；V3A 实现、自审与视觉验收均通过。
Architecture Agent 关闭 V3A-R03 并形成独立本地 checkpoint，
再建立 V3B 的具体 phase plan。没有新增 upstream-owned 文件或 SGP；不 push、不 merge。
