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

## 可旋转喷口

公开可写 `emitterOrientation: Quaternion`，默认 `Quaternion.IDENTITY`，构造时 clone；
它是喷口坐标到模拟局部坐标的单位旋转。`emitterPosition` 仍为模拟局部坐标中的中心，
`emitterVelocity` 为喷口坐标中的初速度。GPU predict 对出生 XY 圆盘偏移和初速度同时旋转，
不改变已有粒子、重力和盒容器；既有调用的默认行为不变。修改在下一模拟步生效，无隐式 reset。

输入必须为有限单位四元数（magnitude squared 误差不超过 1e-6），不隐式归一化。
旋转圆盘沿轴 i 的范围为 `emitterRadius * hypot(R[i,0], R[i,1])`，再加 collision radius
检查容器包含关系。Solver 缓存一个 Matrix3 uniform，不增加 draw、GPU target 或 CPU 回读。
Specs 验证实际 GPU 出生位置/速度、重力、旋转前已存在的粒子、边界及资源保持不变。

`Test/Rendering/水管破洞喷射.html` 演示圆管破口、可调仰角、射流和接水，兼容 Planar / Globe ENU。
管壁只参与渲染，喷口在破口外侧；物理碰撞继续使用闭合盒，不求解管内压力、水锤或流固耦合。
SDK 接入仍属于调用方，原喷泉示例保留。

## 各向异性表面与细喷流

`surfaceAnisotropy` 为可变 [0,1] 控制，默认 1；0 为球形，1 使用 GPU 邻域协方差拟合的
椭球。它只改变重建，不改变模拟状态。Shape pass 在最终位置上求加权协方差，沿用最后一步
预测网格的保守邻域；五次 Jacobi sweep 分解对称矩阵。限制轴长比为 2，归一化 determinant
为 1，最大半轴小于 `1.6 * renderRadius`，同步扩展包围体。少量孤立粒子保留球形，
邻居数从 3 到 12 平滑增加拟合强度，避免不稳定的稀疏方向。

`renderRadius` 现在明确为等体积球半径。顶点用椭球的保守投影盒覆盖，fragment 解析求
真实射线/椭球前后交点，深度与光学厚度使用同一形状；opaque 深度截断真实射线路径。
沿用 rest volume 归一化，禁止变形无故增加吸收。深度滤波的 range sigma 为半个重建半径，
相差超过一个半径的深度不混合，以保留前后分离液层的内部轮廓。

形状存于三张 capacity 大小的 RGBA32F 纹理，需要三个浮点 MRT attachment；首次非零启用
时懒创建，切到 0 后保留到图元销毁。每个有新模拟状态的渲染帧只执行一次 Shape pass，
不逐 substep 重算；暂停和强度变化复用形状。reset 首次重建需先建立初始晶格网格。
新增纹理预算 `capacity * 48 bytes`，无新增全屏通道、运行时 CPU 粒子回读或 CPU 粒子更新。

破管示例 spacing 从 0.065 降至 0.0325 m，capacity 8192、rate 1320/s、lifetime 5s；
缩短寿命并匹配发射体积来限制活跃数量。近看与暂停形状对照用于视觉验收。
此轮未实现独立次级飞沫/泡沫池；后续飞沫见下节，不把此改进称为影视级流体。

Chrome 155 / RTX 3060 Ti / ANGLE D3D11，1185×667，8192 容量破管场景，固定每帧一步，
开关各四个交替 GPU timer 样本：整帧中位 sphere 2.233 ms、ellipsoid 2.552 ms；范围分别
2.194～2.503 / 2.495～2.651 ms。求解+shape draw 为 99/100，新增 393216 bytes；
数据仅代表此本机短样本，不是跨设备帧率承诺。19 项严格流体 Specs 验证形状方向/体积、
稀疏球形、射线深度/opaque 厚度、滤波分层、缓存及生命周期，并保留既有双世界/TAA 回归。

## 次级飞沫

增加可选 `sprayIntensity` [0,4]（默认 0）及 `sprayParticleRadius`（默认 spacing 的 0.12，
允许 0.04～0.25 倍）。采用被主流体驱动的被动视觉粒子，而非提高 PBF 主液体容量。
参考 [FleX diffuse particles](https://nvidiagameworks.github.io/FleX/1.2/lib_docs/manual.html#diffuse-particles)
的主/次级分层思想，自行实现 WebGL2 固定映射槽池，不复制供应商代码。

每个次级槽对应一个主粒子出生候选，已活跃的次级粒子不会被覆盖。使用最后一次 lambda
中的近似密度判断低密度表层，以当前速度和盒碰撞前速度生成出生率；按 `1-exp(-rate*dt)`
采样出生。整数 hash 以槽号与模拟步号为种子，reset 可重复；所有判断/位置/速度都在 GPU。
没有 scatter/atomic、CPU 活跃计数或逐帧回读，不修改主液体质量和动量。

次级粒子采用重力与指数空气阻力，寿命 0.35～0.9 秒。出盒和进入高密度主液体时回收；
重吸收查询复用保守预测网格，读取最终主粒子位置。该版本只提供短寿命弹道水滴，不包含
浮动泡沫、气泡、任意网格碰撞或强流场平流。固定槽分配可能低于均匀分配池的利用率，
这是无需 WebGL2 原子散写和压缩扫描的明确取舍。

两套 position/life、velocity/initialLife RGBA32F MRT 由 solver 拥有，总计 64 bytes/slot，
第一次非零启用的模拟步懒创建。关闭后隐藏和停止出生，已有池继续按模拟步老化并保留资源；
暂停/隐藏冻结，reset 清空并复位 hash 序列，destroy 释放。每 substep 增加一次粒子规模 pass。

独立 instanced quads 走既有 TRANSLUCENT 阶段及 OIT，不属于延迟 water command；复用 HDR
光照与天空、dielectric highlight，透明混合提供近似透射，不追踪每滴折射。软边、有限拖影和
出生/死亡淡入淡出减小闪烁；opaque 与主液体线性深度用于软遮挡，hardware/log depth 保持一致。
不写主场景深度或液体厚度，不增加全屏目标。最大拖影为 3 倍小水滴半径，含四角投影范围
仍小于已有最小液体 culling padding。共享 OIT 的内存/合成通道不属于图元独占计数。

破管示例启用强度 1.5、半径 0.0045 m，同时把主液体重建半径从 0.035 调至 0.026 m，
减少偏大重建产生的鼓包。提供暂停开关对比，原喷泉默认不启用飞沫。

24 项严格流体 Specs 通过，包括确定性出生、静止/失活不出生、弹道/边界/重吸收/寿命、
无运行时回读、资源复用销毁、参数校验、暂停/隐藏/reset、双世界实体与液面遮挡。
Chrome 155 / RTX 3060 Ti / ANGLE D3D11，1001×826，8192 主/次级槽，近看视角，固定一步：
四组交替开关、每组 60 步使先前飞沫过期后测量，整帧 GPU 中位关闭 2.648 ms、开启 3.172 ms；
范围 2.597～2.748 / 2.789～3.595 ms。关闭组仍保留池及老化 pass，不是首次未启用基线。
两组 solver+shape draw 均 101，开启额外提交透明实例 draw；次级纹理 524288 bytes。
短样本只说明此设备与视角下的成本，不承诺跨设备帧率或影视级真实感。
