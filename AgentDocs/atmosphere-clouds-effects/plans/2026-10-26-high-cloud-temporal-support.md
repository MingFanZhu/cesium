# 高质量球面云历史支持

- Type: standalone plan
- Status: completed; owner approved the current cloud-quality checkpoint on 2026-10-26
- Author: implementation / architecture self-review; created 2026-10-26
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Policy: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Review: [implementation evidence and remaining fixture issues](../reviews/2026-10-26-high-cloud-temporal-support.md)
- Scope: SceneGIS-owned producer metadata / resolve GLSL and focused GPU Specs; no upstream / SGP increment.

## 已确认事实

综合环境 Globe 高质量、静止相机与暂停时钟，history 为 exact-stationary-temporal、权重 0.9。
实际一帧 239898 个 opacity > 0.03 的像素仅 43665 接受历史；mean / front 拒绝分别为
154443 / 166932，receiver 拒绝 38072，alpha / RGB 拒绝 50072 / 1603（原因可重叠）。
云随机深度差平均约 882 / 914 m，远大于按 binary16 固定表面精度得到的阈值。
High 非 phased 路径还混合邻域 scene distance，并缺少 medium 已有的 receiver 几何筛选。

## 设计与边界

1. 用实际全分辨率 Globe trace 判别 high 的完整采样路径，与 phased medium 共享
   几何合格邻域、当前 receiver 深度、随机云深度支持和连续 RGBA 历史策略。
2. High 的 source pixel 直接对应当前 texel，不执行 medium 的 2x2 phase 映射。
   保留现有 high 空间权重；当前 mean/front 投影到目标 ray，scene depth 使用目标原始深度。
3. 静止同 ray 不比较随机纵向深度，保留非负、前景、receiver 和 ray alignment；
   移动使用现有支持区间和逐 tap 双线性历史筛选。保留 gamma-1 clipping、0.9/0.82 和全局 cuts。
4. Producer 仅补齐全分辨率 receiver 发布，不改 STBN、密度、纹理、采样步数、资源、API、SDK 或启动优化。
   Low 和 Planar 保持当前策略；medium raster 和已有行为保持不变。

## 验证

- 真实 GPU fixture：高质量静止随机深度 / HDR 波动应累积，前景 / receiver 不符、
  无当前云支持及移动不支持深度应拒绝；current-domain 元数据不来自历史。
- 已有 phased 和云历史相关测试按实际影响选择，保留深度 / 相机 / quality 生命周期证据。
- 原用户视角同输入独立历史对比、移动检查、resolve GPU 时间；诊断资源全部销毁。
- 相关 build、lint、文档检查；技术自审与用户视觉判断分别记录。

风险：高质量新增几何筛选与移动历史 taps 的 GPU 成本、邻近云层关联、快速遮挡残影。
指标只用于确认根因修复，不代替负责人视觉验收。不提交生成物；当前工作不自动提交。

## 执行结果

### 薄边复查

负责人反馈薄边仍跳变，前一轮主体统计不代表薄边通过。真实页面边缘探针发现历史接受率正常，
但透明历史被当前邻域裁剪成高 opacity；极端样本从 0 被裁为 0.837，仅有一个合格云 anchor。
源码确认 Globe high producer 在 ray miss 时保留 `cloudDistances.z = 0`，只有 phased
路径无条件发布 receiver。新 high resolve 的 receiver 筛选因此排除了透明样本。

本轮补齐全分辨率 Globe producer 的 receiver 发布，与支持型 resolve 的采样域一致；
保留 low 策略、medium 相位、历史权重、采样数和资源。将上一条“不改 producer”边界
最小扩展至末尾 distance metadata 发布，不改变 march / 材质。增加使用实际 producer
发布代码的 ray miss / hit 交替 GPU witness，再以原薄边同输入历史对比验证。

五项 focused strict-WebGL GPU Specs 通过；其中两项新增覆盖 producer publication、
透明邻域、旧行为负控、交替 miss、完全消失和前景。真实页面原视角同帧 trace 与独立历史
对照：薄边透明度 / 亮度波动分别下降约 84.3% / 82.4%；trace GPU 中位数 6.95 / 7.03 ms。
未提高采样预算，也不添加 pass、资源或运行时 CPU 回读。构建与视觉交接见 review。

### 前一轮主体降噪

产品只修改 resolve GLSL。三项新 high GPU Specs、两项严格 receiver 回归和普通
radiance/history 综合项通过；旧 strict background fixture 与过期 phased mutation
仍单列为维护问题，不作为通过证据。实际双世界 receiver GPU、原视角同输入对比、
相机 / Clock 移动和当前页面检查完成。原视角亮度波动下降约 68.5%、透明度波动下降约
56.3%，resolve GPU 中位数增加约 0.268 ms；无新 pass、资源或产品 CPU 回读。

既有非 phased 固定表面测试按新 high 契约更新，保留其低噪声 clipping、相机、深度与
元数据验证；独立测试补齐现有 linear-depth uniforms。实际页面恢复原相机、暂停日期、
high 和 cloudTime 0，供负责人视觉判断。2026-10-26 负责人要求提交当前云优化，
本项纳入画质检查点；未改 SDK，残余噪声和已记录的 fixture 维护事项保留。
