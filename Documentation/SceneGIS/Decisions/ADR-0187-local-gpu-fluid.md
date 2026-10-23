# ADR-0187：局部 GPU 流体

- 状态：Accepted（P1 求解器；渲染/API 随 P2 补充）
- 日期：2026-10-23
- 关联：ADR-0087、ADR-0102；无新增 upstream 修改 / SGP
- 计划：[fluid-simulation](../../../AgentDocs/fluid-simulation/README.md)

## 背景与决定

独立的流体喷泉需要真实粒子相互作用；已有 GPU 粒子系统和 FFT 水面不具备密度约束。
当前 develop 是 WebGL2，无 compute atomics / scatter。采用 owned MRT 浮点纹理上的 PBF：
重力预测、排序网格、Poly6 密度 / Spiky 梯度、Jacobi 位置投影、速度更新与盒容器碰撞。
不复制供应商代码，不依赖未合并的 WebGPU 分支。

GPU bitonic 排序 `(cell, id)`，GPU 二分生成 cell ranges，遍历 27 格中的所有候选。
不设固定每格粒子槽位、不截断邻居，不使用运行时 CPU 粒子回读。容量为 16～16384 的
2 次幂，网格最多 262144 格；这是显式资源上限，不是实时性能保证。

每次投影修正至多 `0.1 * smoothingRadius`，每步只建一次网格，cell width 为
`smoothingRadius * (1 + 0.2 * solverIterations)`。查询锚点保持预测位置，距离计算读取
当前投影位置。两粒子的最大相对位移已包含在 cell width 中，因此不会漏掉后续迭代邻居。
预测先投影到容器内；盒约束投影不扩大位移上限。密度只约束压缩，不引入自由表面拉力。

GPU 状态为 position/lifetime 和 velocity；固定容量循环发射替换最旧槽位，寿命到期失活。
刚体局部米制坐标使 ENU 和平面共用求解器；世界变换不改变局部重力 / 粒子体积。
模拟目标是局部视觉流体，不承诺科学级质量守恒、黏性或任意场景网格碰撞。

## 证据与取舍

严格 WebGL Specs 4/4：独立 CPU all-pairs 核对邻居与密度（含投影后、旧网格上的查询）；
压缩峰值下降超过 20%；重力 / 碰撞 / 寿命 / 发射回收 / 重置 / 资源释放；生产 step 不回读。

Chrome 155 / ANGLE D3D11 / RTX 3060 Ti，满容量初始水团，1/60 s、2 次迭代，5 个 GPU timer 样本：

| 容量 | 每步 draw | GPU 中位 ms | GPU 范围 ms   | 持久纹理 bytes |
| ---- | --------- | ----------- | ------------- | -------------- |
| 1024 | 63        | 8.081       | 7.899～13.846 | 198720         |
| 4096 | 86        | 7.979       | 7.113～17.468 | 739392         |

CPU 调度约 0.2～0.6 ms。原逐迭代排序为 120/166 draw，中位约 12.8/13.6 ms，
因此采用保守网格。数据是本机短样本资格证据，包含驱动噪声；没有宣称跨设备 60 FPS。
headless 环境的 Microsoft Basic Render Driver 只用于正确性，不能替代硬件计时。
最终默认容量与液面总预算在 P2 确认；密集邻域最坏可退化为二次复杂度。

## 参考

- [Position Based Fluids](https://mmacklin.com/pbf_sig_preprint.pdf)
- [Fluid Simulation in Alice](https://developer.download.nvidia.com/tools/docs/Fluid_Rendering_Alice.pdf)
