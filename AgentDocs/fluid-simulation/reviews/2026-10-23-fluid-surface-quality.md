# 喷流细节与各向异性重建评审

- Type: review
- Status: resolved
- Author / owner: current task / architecture self-review
- Updated: 2026-10-23
- Target: [表面质量计划](../plans/2026-10-23-fluid-surface-quality.md)
- ADR: ADR-0187
- SGP: None

## 实现与边界

GPU 邻域协方差/Jacobi 得到有界等体积椭球，复用最终一步的保守预测网格。
渲染使用解析射线交点；厚度沿视线计算并由 opaque 截断，合成使用相同视线距离单位。
更窄的 range sigma 和深度分层阈值保留内轮廓，不把分开的深度抹为同一水块。
变化只作用于 Surface，重力/密度求解/碰撞不变。shape 参数不重置粒子。

破管 spacing 减半、发射率对应体积提高，8192 槽位与 5s 寿命限制活跃数量；
保留球面/平面、启停、角度和重置。增加近看及球形/椭球暂停对照。原喷泉增加相同重建滑块。

## F1 / P1 / fixed：正交自动 inverseProjection 为零

源码确认 UniformState.cleanInverseProjection 在 orthographicIn3D 下输出零矩阵。
新交点 shader 改为从 projection 分别构造透视和正交射线，合成正交视向使用固定 +Z。
解析球体测试覆盖两种投影的深度与前景截断厚度。只使用 SceneGIS-owned shader，无上游补丁。

## 验证与性能

- 严格 WebGL `SceneGISFluid` 19/19，通过倾斜水柱主轴/单位体积/最大轴长、孤立水滴、
  透视与正交射线深度/厚度、深度分层、暂停缓存、reset/释放及原有双世界/遮挡/TAA 回归。
- 新分层测试先捕获旧生成 shader，完整构建更新 GLSL 模块后通过；不手改生成文件。
- `build-release`、`build-ts`、`tsc` 通过，类型生成保留既有上游 JSDoc 警告。
- 本次变更 ESLint / Prettier、diff whitespace 和全量 AgentDocs markdownlint 通过。
  全量 AgentDocs Prettier 仍报告 569 个既有未修改文件，与前次基线一致；不扩大格式化范围。
- 实际 Chrome 155 Planar / Globe 破管与原流体喷泉检查；无 console error/warning。
  同一暂停粒子状态对比不同重建强度，圆形高光/水团外观有所减少，仍是有限分辨率液面。
- RTX 3060 Ti / ANGLE D3D11、1185×667、8192 容量、每帧 1/60s 一步：
  4 对交替样本，整帧 GPU 中位 sphere 2.233 ms、ellipsoid 2.552 ms，范围
  2.194～2.503 / 2.495～2.651 ms；CPU 约 1～2 ms。该采样在正交兼容修正之前，
  修正仅将透视逆矩阵重建替换为等价投影系数公式，后续完整 Specs 通过。
- 求解 draw 99，开启形状后 100；额外纹理 393216 bytes（384 KiB）。一次形状更新服务
  同帧所有 substep 的最终状态，常规帧无粒子回读。首次/reset 另需建立初始邻域。

## 结论与剩余事项

可以交付视觉验收。次级飞沫/泡沫未实现，屏幕空间前层近似、仅盒碰撞和最坏邻域开销保留；
不宣称影视真实度或跨设备帧率保证。无 SDK、upstream-owned 文件或 SGP 改动。
上一轮喷口朝向与本轮表面质量均保持未提交。
