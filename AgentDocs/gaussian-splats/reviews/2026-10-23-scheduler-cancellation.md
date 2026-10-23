# Review: 调度取消与加载失败分离

- Type: architecture / code review
- Status: completed
- Owner / reviewer: 本任务（self-review，未启用独立 Agent）
- Date: 2026-10-23
- Target: [standalone plan](../plans/2026-10-23-scheduler-cancellation.md)
- ADR: ADR-0188；既有请求调度契约修复，无新增 ADR
- SGP / upstream-owned files: None / 0

## Finding 与处置

G7 / high / execution / fixed：RequestScheduler 因服务器并发饱和或优先级堆挤出而取消请求时，
Loader 把 CANCELLED Promise rejection 计为失败，消耗有限重试并使索引或 PageWork 提前终止。
原生调度器的取消状态明确可用；无需解析错误消息、提高全局并发上限或绕过调度器。

修复在自有 StreamLoader 的共同 `_startTask` 路径进行：先保留自身取消/销毁的终止语义，
再将仍有需求的 CANCELLED 请求返回 queued，递减本次 attempts 并清除失败退避时间。
正常 update 重新申请调度；已有 finally 和 group 收尾释放/传播请求、字节和 attempts。
保留先前真实失败次数，取消不发出 terminal settlement，不新增重试定时器。

## 验证证据

- 新增 `SceneGISGaussianStreamLoaderSpec` 5 项通过，使用真实原生 RequestScheduler，
  注入确定性 MCI4/GSP 响应；没有访问测试域名或依赖网络时序。
- 同源 imagery 请求先占服务器连接，在 update 阶段触发 CANCELLED；manifest、MCI、
  pack header、两个合并 page 各连续取消 4 次（超过默认重试上限），解除竞争后全部完成。
  取消前没有发出高斯传输，retries/failures 为零，active request/bytes 回零。
- 原生 priority heap 挤出真实请求后，page 重新入队并完成。
- 真正网络错误与取消交错时只计实际失败，三次失败后发布一次 terminal settlement，
  两个 page 均正确关联；此前真实错误次数不会因调度取消被清零。
- 移除需求与在途销毁保持取消状态；AbortController 收到 abort，清理后不重新排队。
- 修复前专项用例复现取消增加 attempts/retries 与过早失败；修复后专项 5/5 通过。
- `npx gulp test --includeName SceneGISGaussian --browsers ChromeHeadless --webglValidation --failTaskOnError --suppressPassed`：
  253/253 通过，含真实 Worker、球面/平面渲染、资源销毁和 IndexedDB；执行时约 13.9 秒。
- gulp test 重建 development engine/Specs 成功；定向 ESLint、Prettier 与 diff 检查通过。
  本次不改公共 API、类型、构建、Shader 或 Worker，无需重复完整发布/类型资格。
- 全量 AgentDocs Markdown lint 通过；全量 Prettier 报告 596 个本次未修改文档的既有格式问题。
  本次变更文档的定向格式检查通过，未扩大修改范围。

## 剩余风险与交接

无本修复未解决 finding。持续饱和或长期更高优先级竞争仍可能延迟加载，这是既有调度策略；
该等待不再耗尽失败预算。已经进入 FAILED 的旧图元需要重新创建后使用修复代码。
未使用用户的大型真实资产做现场复测；既有大资产/设备资格边界仍见 P2 review。
本修复只修改一个 SceneGIS-owned 实现文件，未修改上游 RequestScheduler 或 SDK。
负责人已要求在 `scenegis/develop` 本地提交；上述真实资产与持续调度竞争边界保留。
