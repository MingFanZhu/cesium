# ADR-0187：局部 GPU 流体

- 状态：Accepted
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

## P2：原生图元与连续表面

`SceneGISFluidPrimitive` 提供不可变布局和可变发射 / 暂停 / 刚体放置，默认容量 4096、
1/60 s 固定步长、最多追赶 2 步，超出丢弃；时间倒退重置，隐藏 / 暂停不追赶。
资源懒创建并绑定单一 Context，由 PrimitiveCollection 正常拥有；无运行时粒子回读。

Instanced spheres 写最近线性深度；R16F 加法厚度按 rest volume / sphere volume 归一化，
避免重建半径增大导致吸收体积无故增大。两次双边平滑、有效邻居法线重建形成连续前表面。
最终合成拒绝 opaque 前景，写真实/log depth 和共享 final depth；通过 pickPosition 与 TAA
depth 的自动化验证。复用 WaterFrame 场景捕获和 owned 光学 helper、环境光照、天空及 SSR。
改动均为 SceneGIS-owned；沿用现有 WaterFrame 调度，不修改上游文件或新增 SGP。

默认 reconstruction scale 0.75；1920×919 画面自有 GPU 纹理/深度缓冲约 16.64 MB，
求解 86 draw，重建/合成 5 draw。RTX 3060 Ti / Chrome 155 的完整示例计时存在明显波动：
初次 6 样本 32.4～39.4 ms，后续场景/表面/完整帧分段测量中的完整帧 4.47～4.90 ms。
CPU 完整帧约 1.5～1.8 ms；这些是当前驱动/场景条件下的有限样本，不据此承诺固定 60 FPS。
预算包括示例场景和环境；透明前层近似、密集邻域开销和缺少刚体/网格碰撞仍是明确限制。

## 粒子大小与背景透射修正

公开可写 `renderRadius`（米，spacing 的 0.5～1.5 倍），改变重建、平滑和包围体，
暂停时也生效，不改求解器布局、rest volume 或 collision radius，不分配新 GPU 资源。

Fluid 通过 owned 私有标记 `_sceneGISWaterBackground` 声明完整背景透射需求。
Deferred 复用 water color 捕获，将背景绘制和 opaque 光照后的主 HDR 颜色整体复制；
共享 SSR/SSIL radiance 不包含 clear-depth 背景，因此该场景也执行 water capture。
WaterFrame 保持原有捕获优先级与真实 opaque depth。水面独立使用时保持原来协议。
此处直接借用已绘制的背景，避免用反射 cubemap 近似可见天空亮度、太阳、星空或隐藏状态。

普通喷泉仍为每帧一次已有颜色 copy，无新增纹理；共享 lighting MRT 时增加一次全屏 copy，
复用 Scene-owned RGBA16F water target（含 mipmaps 约 `width * height * 8 * 4/3` bytes）。
资源随 Scene 销毁；图元只借用，不销毁此捕获。Specs 验证暂停调大小不重置/重分配、
clear-depth 彩色背景透射、共享 SSR、每帧一次 copy、纹理复用与 Scene 销毁释放。

液面法线差分统一使用整数重建格点和对应像素中心，避免降采样后以连续 screen UV
偏移读取 nearest depth 时在 texel 边界跳行。最终合成位置仍由实际屏幕像素重建，
不改变输出深度与遮挡契约。透视解析斜平面回归及实际暂停画面验证该修正。
