# D2：Layer 动态样式运行时

- Type: phase plan
- Status: completed (technical); owner visual gate pending
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review
- Architecture review: confirmed
- Parent: [extension](2026-10-16-dynamic-style-extension.md)
- Prerequisite: D1 `7414056515`，17 项 Core Specs 通过
- Related: ADR-0163、ADR-0067、ADR-0068、ADR-0076；SGP：无

## 源码事实与方案

Layer 保存稳定 sources/entries，`prepareEntry` 按每个 style record 的 signature 复用无关 batches；
promise 只交回 CPU，normal frame 才上传并释放旧 GPU。现 Worker 配置仅传一次，symbol 仅按整数 zoom
整体重建，主线程 symbol evaluation 使用 owner.style，会与异步 layout 更新冲突。

1. 公开七个方法，复用 D1 候选。成功后立即替换 Layer.style 与对应 record，不修改旧 compiled Style。
   保留旧 batch 的 record，使新 GPU 发布前仍有一致的旧绘制快照；不在 setter 操作 GPU。
2. 相应 source 的内容 revision 隔离在途结果；未修改 source 的任务仍可完成。
   Worker slot 按当前 Style snapshot identity 更新编译配置；不重建线程或重新请求 MVT。
3. symbol 每个内部层记录 revision，准备并替换相关候选；不丢弃其他层候选、glyph/sprite atlas 或 shaping cache。
   已发布候选持有其 compiled Style，避免旧 label 使用新 filter/layout。发布后取消过时 placement job。
4. 首次设置 pattern 时创建 lazy owner，正常帧才请求/上传；删除后保留 atlas 供复用，destroy 正确释放。
5. 更新依赖仍包括 feature/global state；失败不改 readiness。无变化不调度；隐藏保留规则，显示后刷新。

首版规则编辑粒度为受影响的内部 style layer：几何重新准备该层批次，symbol 重新准备该层候选，
相同 normalized shaping 可复用。不是逐属性 GPU subrange 优化，也不承诺跨瓦片同帧全图切换。
已有可见结果保留到其替代内容发布；异步错误沿用 errorEvent 和最后成功内容。

## 验证

- Layer 契约：共享 Style、独立快照、失败原子性、null/default、即时 getter、state/show/opacity/source 身份。
- 生命周期：隐藏、待请求、在途 Worker 与连续编辑、无关批次保留、destroy 后迟到结果。
- 真实 Worker 验证两个 slot 获取最新 style；symbol layout/filter/paint 与资源复用。
- Planar/Globe 实际绘制和 pick；修正必要的 fixture 默认环境隔离，不放宽颜色断言。
- 完整 dev/release、build-ts/tsc、scoped lint 与文档检查；记录更新的任务/上传/缓存成本。
- 自审、独立本地提交，向当前对话交付 API 与 SDK 升级条件；不自动修改 SDK 或推送。

## 执行结果与偏差

七个公共方法、完整快照、按 source 隔离旧任务与按内部层替换 batches/candidates 已实现。
Patterns 延迟启用，旧符号使用已发布版本求值，Worker pool 和原始 MVT cache 保留。
测试沿用正常渲染与真实 Worker，没有为测试加入产品分支。

受影响六组 Specs 113 项中 112 通过，唯一失败为旧代码同样存在的 pick derived command 断言；
其余 9 项新增动态规则测试在该组通过。之后补充 background 的资源替换和 visibility/default 回归，1 项通过。
Core 17 项通过；双世界 development/release 控件、导出与状态保留 E2E 4 项通过。
完整 build、build-release、build-ts、tsc 通过。最终明细、基线对照、限制和 gate 见
[D2 self-review](../reviews/2026-10-16-d2-layer-style-runtime.md)。

实际必要的测试适配：Layer/Styles 的精确颜色 fixture 显式关闭默认物理环境并使用 gamma 1；
symbol cache 的既有断言改为验证内部层缓存身份，符合当前复用粒度。没有放宽颜色容差。
同样隔离示例页的默认环境，避免 Globe 夜间导致规则验收无法观察；产品环境默认值不变。

Architecture 技术 gate 允许 D2 独立本地 checkpoint，不代表负责人已验收新增动态规则。
下一步仅为双世界人工视觉 gate 和 SDK 自行升级引擎、Worker 与类型产物；未修改 SDK lock。
