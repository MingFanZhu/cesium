# Discussion: 延迟光照的 AA 与既有能力接入

## Metadata

- Status: `resolved` for P2 design；实现与性能资格待验证
- Owner role: `architecture`
- Created / Updated: `2026-10-13`
- Parent: [P2](../plans/2026-10-13-p2-deferred-lighting.md)
- Prior evidence: [P1 review](../reviews/2026-10-13-p1-gbuffer-qualification.md)，WDR-P1-02

## Evidence and decision

P1 的实际 GPU 覆盖证明 4× MSAA resolve 会将轮廓材质和背景混合。对混合后的 normal、
roughness、F0 再执行非线性 BRDF 不等价于原来的逐 sample 着色。不能把颜色缓冲支持
MSAA 推导为 G-buffer 可以无条件保留相同 AA 语义。

方案 A 为首版单采样材质缓冲，复用现有 TAA / FXAA；配置 `msaaSamples > 1` 明确报错，
不自动改动它。方案 B 为先设计独立的 MSAA 边缘方案，再接延迟照明，增加资源和集成范围。
负责人于 2026-10-13 选择 A。此选择只约束私有延迟实验入口，不改变稳定前向页面的设置。

源码确认 Model 拥有独立 IBL / lightColor，native 阴影在材质前计算，街道默认开启 AO/SSR。
因此 P2 采用有 Model 上下文的屏幕光照，保留材质 pass 的原阴影可见度查询，并将屏幕光照
结果写入现有响应 MRT。复用原光照与消费者计算，避免全局环境设置覆盖模型定制，也不关闭
已有默认效果来构造“延迟更快”的对照。具体范围与验证见 P2 plan。
