# 液面法线细线评审

- Type: review
- Status: resolved
- Author / owner: current task / architecture self-review
- Updated: 2026-10-23
- Target: [法线细线计划](../plans/2026-10-23-normal-seam.md)
- ADR: ADR-0187
- SGP: None

## F1 / P2 / fixed：缩放重建的法线横向断层

中心与邻域深度改为同一整数重建格点上的 texelFetch，位置使用各 texel 中心。
视口外邻居标记无效，沿用有效单侧差分。最终深度/picking 使用真实屏幕像素，不随法线格点偏移。
通过实际用户视角的诊断法线、正常着色前后对比，确认横线消失。

透视斜平面自动回归先失败再通过，严格 WebGL FluidPrimitive 9/9；包含此前大小、
天空透射、两种 world、遮挡、TAA 和资源测试。Chrome 155 / Windows，实际预览与 headless
驱动均验证；后者不表现相同幅度的跳行，但解析平面检出了采样中心偏差。

## 资源、性能与范围

修改仅限 Fluid composite GLSL 和对应 Specs / 文档。纹理读取次数保持 5 次，
每个液面 fragment 多重建一个位置；不增加 pass、纹理或 CPU 回读。求解器不变。
GLSL 由现有构建链生成，未手改或提交生成文件。无 SDK、上游改动或 SGP。

## 结论

允许交付，未发现本修复的未解决事项。屏幕空间分辨率及前层近似的既有边界继续保留。
