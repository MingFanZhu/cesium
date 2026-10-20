# 平面方向性多次散射

- 类型：standalone plan
- 状态：implementation verified；负责人视觉判断保留
- Owner：当前任务，Architecture / execution
- Created / Updated：2026-10-20
- Parent：[extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related：ADR-0042；无 upstream-owned file / SGP 增量
- Review：[技术评审](../reviews/2026-10-20-planar-directional-scattering.md)
- 授权：补齐平面方向性多次散射，保留平面几何，不调色补偿；同中午视角、关闭高度雾对比。

## 事实与边界

现有 PlanarEarth 构建器对每阶入射辐亮度取方向平均，再乘局部散射系数。
这等价于高阶散射使用各向同性相函数，丢失 Rayleigh 与 Mie 的方向性。
保留固定 +Z 平板、解析消光、真实边界路径、2–4 阶递推和 n-2 阶地面反射。
球面资产、运行时 Shader、曝光、物理系数和 LUT 纹理布局不变。

## 实施与验证

1. 离线用实余弦球谐保留入射方向分布，按 Rayleigh / Cornette–Shanks Mie
   相函数分别卷积；初始 12 阶预算，按独立直接角积分决定是否足够。
2. 沿路径积分与观察方向求值分离，避免对每个 LUT 方位重复积分。
3. 测试相函数归一化、非各向同性源、各阶与地面边界归属、独立角积分误差、
   确定性和非负有限输出；重新生成资产、provenance 和批准哈希。
4. 记录完整离线构建耗时；核对纹理大小、查询与资源身份，测量实际 GPU pass。
5. 现有综合页同南京中午、同局部视角、关闭高度雾，比较平面修改前后及球面。

## 风险与交接

球谐截断、角积分、源网格插值及有限散射阶数均为数值近似；不能用与旧模型
一致代替方向精度验证。平板的无限水平路径与球面曲率仍会造成真实差异，
不承诺两幅图一致。原有自动曝光与高度雾未提交改动保留，不混淆验证结论。
全部实现限定 SceneGIS-owned 文件，无预期新增 SGP；2026-10-20 负责人后续授权本地提交并汇入 develop，未授权推送。

## 实施结果

最终使用 degree 16、上下半球各 16 个 zenith nodes 与 64 个 azimuth samples。
12 阶初选在低太阳高度的方向性源对照中偏差较大，因此提高离线展开阶数。
17 项 Node 测试通过，包括 full canonical regeneration、独立直接角积分、各阶与地面
边界归属、相函数归一化；4 项实际 WebGL 回归通过。构建与运行成本、交付检查及画面对照
见 review。运行时几何、Shader 和资源布局不变；两页保留同中午、同视角、关闭高度雾。
按上述后续要求独立提交，未推送；高度雾与自动曝光另行提交，不视为本项新增功能。
