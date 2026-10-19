# 高度雾完整可见段积分

- Type: standalone plan
- Status: implementation verified；负责人视觉验收待定
- Owner: 当前任务，Architecture / execution
- Created / Updated: 2026-10-19
- Architecture review: confirmed；用户已授权修复完整范围和固定预算采样
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- ADR: [ADR-0045](../../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md)，本次补充修订
- Upstream-owned files / SGP delta: none

## 根因与范围

336250 m 高空的当前 Globe 视角，地平线下方射线在 60 km 雾层内长约 535 km，
原 `segmentStart + 300000` 在约 21 km 高度终止，漏掉近地主要光学厚度。
移除 Globe / Planar 高度雾的固定介质长度上限；地表深度、雾层边界和显式 startDistance 继续裁剪。
Planar 复用常量成本解析积分。Globe 保留最多 16 次密度采样，通过有误差上界的稀薄尾部裁剪
集中采样；若数值验证无法满足原 0.005 fog amount / 2% optical depth 精度，则调整采样映射而非放宽误差。
不改默认密度、最大不透明度、天空 LUT、云积分、公共 API、pass 或资源所有权，不增加俯角阈值。

## 实施与验证

1. 使用现有共享 GLSL 构建入口与真实 Context 浮点 fixture，先新增当前视角失败回归。
2. 实现完整可见段与固定预算采样，覆盖长斜射、完整切线、有限接收点、uniform density、Planar 长距离。
3. GPU 结果对独立双精度积分；检查连续高度 / 倾角以及 300 km 原边界的连续性。
4. 当前真实页面保留图层、时钟、雾参数，在同视角及连续高度 / 倾角变化下检查画面并恢复相机。
5. 同输入原 / 新 Shader 的 GPU timing，检查 warm 资源 identity 与释放；不创建新的持久资源。
6. scoped lint / format、dev 构建、相关 Specs、ADR / 索引 / 技术自审；不扩展到无关既有 fixture。

## 实现与交付

已移除两个世界的固定长度截断。Globe 按完整可见长度计算稀薄尾部高度，省略光学厚度
上界为 `1e-7`，在保留部分执行原有 16 点求积；uniform fog 直接解析积分。
无新增资源或采样预算，无默认参数或俯角补偿变化，无设计偏差。

新增真实 GPU 数值回归覆盖 269 条射线，原实现失败、修复通过；相关 warm uniform
资源验证通过。真实场景检查高度 20～1000 km、倾角 -0.2～-0.85 rad 连续变化，
已恢复原相机。相同输入下 Aerial pass GPU median 从 0.121856 ms 到 0.128 ms。
完整命令、范围及剩余风险见[技术评审](../reviews/2026-10-19-height-fog-visible-segment.md)。
负责人最终视觉判断保留为交付反馈；2026-10-19 负责人要求将已验证修复形成独立本地提交，不推送。
