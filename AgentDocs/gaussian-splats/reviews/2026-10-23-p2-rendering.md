# Review: P2 原生分段渲染与交付

## Metadata

- Type: architecture / code review
- Status: completed
- Owner / reviewer: 本任务（未启用独立评审 Agent）
- Date: 2026-10-23
- Target: [P2](../plans/2026-10-23-p2-native-rendering.md)
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: SGP-0067
- Upstream-owned files: `packages/engine/Source/Renderer/createUniform.js`（唯一文件，4 行带标记集成）

## Findings and disposition

| ID      | Severity | Finding                                                                | Disposition | Evidence                                                                                                                                 |
| ------- | -------- | ---------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| G3 (P1) | medium   | 旧测试的 MCI3/XY、raw byte GPU 预算、未准备 Core receipts 等契约已过时 | fixed       | 当前 MCI4 fixture；atlas padding、prepared receipt、partial SH、160K 排序、真实 Worker transfer、资源上限和异步清理由迁移后的 Specs 覆盖 |
| G4      | high     | Scene 立即销毁时，旧实现等待 Worker 后才释放 VAO，调用已销毁的 Context | fixed       | 已复现 `VertexArray.destroy -> Context.glDeleteVertexArray` 异常；requestDestroy 同步释放 renderer，in-flight Scene teardown Spec 通过   |
| G5      | low      | atlas 释放后 allocatedTextureBytes 仍报告原容量                        | fixed       | 释放完成后归零；同一 teardown Spec 检查 0 字节和 0 cleanup debt                                                                          |
| G6      | low      | 启动中的开发服务器未包含新增 Worker entries                            | resolved    | 只重启开发服务，未修改上游构建；使用文档明确新增 Worker 后需重启                                                                         |

旧 GlobalFullChain Spec 手工拼接退役 receipts 和 position registrations，已由公共原生图元的
real Scene / Worker / WebGL 全链路测试替代。旧 fixture 改为当前 CPU builder 输出的 MCI4，
更新非 identity transform 的 ABI offset、GPU padding 计数和已合法的 prefetch work class。
完成队列异常的测试分离 controller routing 与 adapter 的实际验证/lease release，避免把
已经复用缓存、不再发起请求的 transition 当成 HTTP completion fixture。
没有修改生产协议去容忍旧测试，也没有产品测试专用分支或禁用的 Jasmine 测试。

## Verification

- `SceneGISGaussian`：248 tests，严格 ChromeHeadless/WebGL validation，全通过。
- 上游 `Renderer/ShaderProgram`：23 tests，全通过，覆盖原有 uniform 类型与 shader 编译。
- P1 工具/纯协议：78 Node tests 通过；同输入新旧 manifest/MCI/GSP byte-identical。
- 独立 CPU 示例生成 7680 source splats，CLI validate 通过；生成物仅在 ignored Build。
- dev build、release build、build-ts、tsc 通过；声明包含唯一原生 public primitive。
- Engine ESLint、变更文件 Prettier 与 diff whitespace 检查通过。
- SGP audit 通过：本次唯一上游文件为 createUniform；没有手改/提交生成文件。
- npm tarball 包含 public source/types、两种 compiled Workers 及依赖 chunks；解包后 public import、两个编译 Worker 的消息/transfer 执行通过。
- 浏览器实际观察平面与球面 ENU 双环、显隐及不透明遮挡，图元 READY；刷新与切换页面正常。

### 有边界的性能记录

Windows 10 / Chrome 155、ANGLE D3D11、RTX 3060 Ti，画布 1001×826，球面 ENU。
确定性双环 7680 splats / 56 active slots，配置 atlas 128 MiB。
稳定相机 120 帧 preRender→postRender：显示中 median 2.0 ms / p95 2.6 ms；
隐藏中 median 2.0 ms / p95 2.7 ms。该值是场景 CPU/driver 提交时间，不是 GPU timer 或完整帧率。
显示时 120 帧新增 GPU upload 0 bytes、sort dispatch 0，atlas 容量稳定。
自动化另覆盖 20 帧对象/容量稳定，以及无逐帧 GPU readback 的运行时路径。
测试与浏览器截图、日志只留 ignored Build，不作为仓库二进制基线。

## Gate and remaining risks

架构/代码 review 通过，按 P2 独立本地 checkpoint 交付。只包含分段渲染和 CPU 工具，
不含 fixed10、训练蒸馏、SDK；不 push 或自动合并。
大规模真实扫描资产、不同设备的性能和负责人最终视觉验收仍需后续数据验证；
不能用小型合成场景推断百万级资产帧率。多图元仍是 command 排序、捕获外观不参与 PBR 重光照，
这些是保留方案的明确边界，见使用文档。
