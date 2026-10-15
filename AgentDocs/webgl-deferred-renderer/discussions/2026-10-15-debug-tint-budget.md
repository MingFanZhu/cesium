# 调试着色的独立数据与提交预算

- Type: discussion；Status: resolved；Created: 2026-10-15。
- Owner / architecture: 当前任务。
- Parent: [P4g](../plans/2026-10-15-p4g-all-draw-command-producers.md)。
- Finding: [WDR-P4G-06](../reviews/2026-10-15-p4g-all-draw-command-producers.md)。

## 已确认的接点

当前 DeferredLayout 拒绝 debugShowCommands / debugShowFrustums，DeferredLighting.begin 另拒绝 shadowMap.debugCascadeColors。debugCommandFilter 已恢复并经 GPU 验证，但不能代表上述三个着色入口完成适配。

原生 DebugInspector 在 Scene 的延迟入口之前执行原始受光命令；直接删除门禁会绕过材质阶段。把调试颜色乘进 albedo 也不等价：BRDF、emissive、镜面与样式并非全部随 albedo 线性变化。既有 style 目标还承担 feature multiplier 或 Globe Fabric 颜色，不能无条件借用其通道。

## 建议

保留既有诊断含义：按命令随机着色、前三个视锥的 RGB 重叠编码、阴影级联 tint 都作用于完成光照的颜色。新增成本只在三个诊断开关之一实际启用时出现；正常渲染零新增资源和提交。

1. 每个可见不透明表面命令额外执行一次仅输出调试 tint 的提交，复用其材质求值 / discard / 裁剪与深度，不计算光照。普通材质仍走统一延迟。透明与专用颜色通道在其原有绘制内应用 tint，不增加透明提交。
2. 一张按需 RGBA16F 保存当前可见表面 tint，复用已有深度；不增加材质 MRT 的附件需求或主光照 sampler。开启半透明反色分类时，为其独立材质集另需同规格 tint 目标。1280×800 通常 +7.8125 MiB，最多 +15.625 MiB；多视锥复用目标。
3. 每次实际光照合成完成后增加一次屏幕乘色，再进入水面 / 透明时序；普通集合一次，反色分类独立集合另一次。按视锥上限核算为每视锥最多两次，已有跨视锥合并时普通集合仍只合成一次。不重放完整受光 Shader，不恢复第二套不透明前向管线。
4. 关闭所有诊断开关、目标不再可见、resize 或 destroy 时释放 / 重建所需资源。允许开关切换，不改变现有公共属性和场景设置。

先采用统一的额外 tint 提交，使满 MRT 的 Globe / 分类 / 扩展材质也使用同一已核算路径；不增加容量不足时的静默降级。调试模式的额外几何成本是本方案明确代价，不能算作普通渲染的性能回归或隐瞒在光照提交中。

## 验证与待决

技术验证须覆盖命令 / 视锥 / 级联开关、材质与原有阴影、透明 OIT、标注 / 水面专用顺序、分类和多视锥，以及关闭与销毁归零。使用真实 GPU 和新增可复现页面；负责人视觉确认后关闭 WDR-P4G-06。

2026-10-15 负责人明确接受调试专用预算并指示继续适配。按以上上限实施；技术与负责人视觉验收仍待完成。此批准独立于点云 EDL 与扩展材质预算。

## 当前实现与待核对偏差

当前实现把 tint 合入屏幕光照与间接响应，保证在分类混合之前完成：普通集合没有额外屏幕提交，但主光照增加一个 sampler。反色分类将既有 mask 从 RGBA8 升为 RGBA16F，用 GBA 存 tint，另加 4 bytes/pixel 和一次屏幕合并；加上普通 tint 为 12 bytes/pixel，低于批准的 16 bytes/pixel。已测 clearcoat / anisotropy / specular 与 AO / SSR / SSIL / 局部灯共用时最多 16 samplers；带 feature style 等满容量组合尚待完成核对，不能据此关闭全部容量风险。普通非调试渲染无新增成本。

负责人本次调试视觉未通过；页面反射和 Globe 法线布局缓存修正见 P4g review 的 WDR-P4G-12，修正后的画面仍待重新确认。原预算批准继续有效，技术方案偏差和最终 gate 保持可追踪。

## 后继技术结论

满容量核对实际复现 17 个 fragment samplers 超过设备 16 的链接失败。SGP-0059 将原有扩展材质最多四张 RGBA16F 改为一个二维数组的独立层，减少至一个采样器；精度、MRT 附件数、分配字节、提交和设备门槛不变。技术方案见 ADR-0160。真实 Globe / Planar 的 feature style + specular / clearcoat / anisotropy + 云影 / 局部灯 / 共享屏幕效果 / debug 组合现为最多 14 个采样器，两项浏览器检查通过；材质、反色分类与数组生命周期 GPU 通过。

因此此前增加一个主光照 sampler 的偏差已在原资源预算内关闭，不需要额外预算；普通 8 bytes/pixel、反色合计 12 bytes/pixel 与最多一次屏幕合并均未超过批准上限。剩余 gate 只有负责人调试 / 阴影修正的视觉确认及阶段最终提交；原生透明对象的水面 SSR 倒影已由负责人明确暂缓。

## Final owner acceptance

2026-10-15 负责人确认最终画面通过并要求提交 P4g。批准预算内的技术、资源与负责人视觉 gate 均已关闭；P4g 阶段最终结论见 [review](../reviews/2026-10-15-p4g-all-draw-command-producers.md#phase-gate)。反射探针与透明物体水面 SSR 的明确暂缓决定保留。
