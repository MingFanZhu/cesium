# 综合环境自动曝光对照评审

- Type: architecture / code review
- Status: approved；示例技术验证通过，曝光外观由负责人继续比较
- Owner: 当前任务，Architecture / execution self-review，未启用独立 Agent
- Created / Updated: 2026-10-20
- Target: [standalone](../plans/2026-10-20-integrated-auto-exposure.md)
- ADR / SGP: 消费 ADR-0100 / SGP-0027，无增量
- Upstream-owned files: none

## 实现与风险处置

1. 只组装既有 SceneGISAutoExposure，不启用原生私有自动曝光开关，不改变测光、色调映射或引擎默认值。
2. 开启自动曝光同时打开 HDR，关闭 HDR 同步禁用控制器，保持其公开契约。手动曝光保持调用方所有权并参与乘法。
3. 恢复环境默认值先禁用并恢复自动曝光参数，再恢复 HDR / tone mapper / exposure；相机、日期、图层不变。
4. 诊断明确为示例私有读取：已有 1×1 RGBA 结果为 divisor / adapted log2 gain / target log2 gain / mean log2 luminance。
   显示的自动与目标倍率不含补偿；合成倍率为 1 / divisor。不开诊断时零读回，开启时最多 4 Hz，无额外 GPU 资源。
5. Scene 拥有控制器并在 Viewer 销毁时释放；页面移除 postRender 监听，沿用 BFCache 和重复销毁规则。

## 验证证据

- `scenegis-environment-examples.spec.js` 的两项 Integrated environment E2E 通过（Globe / Planar），禁止外网初始化。
  覆盖默认未启用且未分配资源、开启强制 HDR、锁定后 +1 档使实际 GPU 合成倍率翻倍、诊断数字一致、
  关闭 HDR 释放资源且手动倍率不变、恢复所有默认参数、保留时刻、BFCache 和控制器销毁。
- 当前 Globe 原相机 / 原时刻 / ArcGIS 影像，在手动 1 与自动约 0.665 倍率间对照；画面变暗且渲染错误为空。
  Planar E2E 调整画面已检查，其夜景高合成倍率来自测试显式设置的手动 2、补偿 +1 和锁定，非新默认值。
- scoped ESLint / Prettier、diff whitespace 检查通过；无产品代码变化，不重复引擎构建或完整 Specs。
- AgentDocs 全量 Markdownlint 通过；全量 Prettier 仍报告 452 个既有格式问题文件，本次文件检查通过。
  所有权审计无 upstream-owned 增量；截图和日志位于忽略的 Build 目录，不提交。

## 边界与后续

可选同步 GPU 读回有诊断开销，不用于性能测量；其私有结果布局变化时需同步示例。
测光为相对亮度，非 EV100 校准；几何平均全局增益也不代表负责人已验收所有昼夜、天空占比下的曝光外观。
当前只提供对照工具，不调整算法、曝光上下限默认值或新增模拟时钟依赖。
用户页已开启自动曝光与诊断供继续比较，代码初始仍关闭。2026-10-20 按负责人后续要求独立提交，未推送。
