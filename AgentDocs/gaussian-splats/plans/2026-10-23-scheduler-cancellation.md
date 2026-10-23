# Standalone plan: 调度取消不消耗高斯加载重试

- Type: standalone plan
- Status: completed
- Owner: architecture / execution（本任务）
- Date: 2026-10-23
- Architecture review: confirmed
- Related ADR: ADR-0188；无新增协议或公共 API
- SGP / upstream-owned files: None / 0
- Review: [调度取消修复](../reviews/2026-10-23-scheduler-cancellation.md)

## 已确认源码与范围

`SceneGISGaussianSegmentedPrimitive` → RuntimeController → StreamLoader 的 `_startTask`
同时承载 manifest、MCI、pack header 与 page Range 请求。原生 RequestScheduler 在同服务器
并发达到上限或请求被优先级堆挤出时，将 Request 标记为 CANCELLED 并拒绝 Promise。
Loader 只检查自身取消标记和 AbortError，把该调度结果计入 attempts/retries，最终提交失败。
page group 的清理会把 group attempts/state 传播回各 page；必须保留这条生命周期。
当前图谱缺少迁移后的 Gaussian 模块，已通过源码补全调用链。普通 JS / Specs 由既有
gulp build/test glob 生成入口，生成文件不修改、不提交。

## 实现与验证

1. 用真实 RequestScheduler 复现同服务器竞争和优先级队列取消，注入确定性本地协议数据响应。
2. 已被自身取消或销毁的任务仍终止；仍有需求的 CANCELLED 请求回 queued，归还本次 attempt，
   不消耗失败退避或发布 terminal settlement。后续正常 update 再申请调度。
3. 覆盖 manifest/MCI/header/合并 page 的恢复、反复取消超过 retry limit、真实错误计数、
   主动取消与销毁、active request/byte 释放。
4. 运行最小 Loader 回归、现有 Gaussian 引擎资格及 scoped lint/format；不改调度器全局上限、
   优先级、SDK、Shader、Worker、公共 API 或固定网格路线。

## 退出条件

请求竞争解除后加载恢复；取消不产生失败或耗尽重试，真实网络/协议错误仍有限重试后报告。
记录 review 与测试结果；提交遵循负责人指示。

## 结果

已在 `_startTask` 拒绝分支按 RequestState.CANCELLED 归还本次 attempt 并回 queued，
不增加 retries/failures、不写 terminal settlement。自身取消和销毁先行处理；沿用原 finally
释放 active request/bytes，并通过已有 page group 收尾传播状态与计数。
未增加定时器、额外循环、调度器参数、公共选项或 Shader/Worker 变更。

新增 5 项真实调度器 Specs 通过：四种加载阶段各连续取消 4 次、优先级挤出、真实错误与取消
交错后严格达到重试上限、需求移除、在途销毁。修复前用例复现错误计数与过早失败。
`SceneGISGaussian` 全部 253 项严格 WebGL Specs 通过，含现有真实 Worker、球面/平面渲染和
IndexedDB 回归；定向 ESLint/Prettier 与 diff 检查通过。负责人随后要求在 `scenegis/develop` 本地提交。
