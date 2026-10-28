# 局部三维城市风场：引擎与 SDK 接入

首版提供独立的 WebGL2 空气流动模块，按局部米制规则网格求解静态建筑绕流。
与 PBF `SceneGISFluidPrimitive`、SDK 的 VTI `CfdField` 分开。本次不修改 SDK，
不复制发行包。API 与数值模型仍为 experimental，适合交互可视化；工程定量预测需独立验证。

## 最小调用

已有 SDK 场景可直接挂载以下引擎对象。先添加求解器，再添加显示组件：

```js
const dimensions = new C.Cartesian3(128, 128, 32);
const minimum = new C.Cartesian3(-128, -128, 0);
const cellSize = 2;
const polygons = [
  {
    positions: [
      new C.Cartesian2(-12, -10),
      new C.Cartesian2(12, -10),
      new C.Cartesian2(12, 10),
      new C.Cartesian2(-12, 10),
    ],
    minimumHeight: 0,
    maximumHeight: 30,
  },
];
const solidMask = C.SceneGISWindObstacleMask.fromExtrudedPolygons({
  dimensions,
  minimum,
  cellSize,
  polygons,
});
const placement = C.Transforms.eastNorthUpToFixedFrame(
  C.Cartesian3.fromDegrees(-74.006, 40.713, 0.2),
);
// Planar World: Matrix4.fromTranslation(new Cartesian3(worldX, worldY, groundZ)).
const wind = scene.primitives.add(
  new C.SceneGISWindSimulation({
    dimensions,
    minimum,
    cellSize,
    modelMatrix: placement,
    solidMask,
    windSpeed: 3,
    windDirection: 0,
    timeStep: 0.02,
    kinematicViscosity: 0.000015,
    smagorinskyConstant: 0.12,
    tracerDiffusivity: 0.15,
    tracerSources: [
      {
        position: new C.Cartesian3(-50, 0, 8),
        radius: 6,
        rate: 0.25,
        enabled: true,
      },
    ],
    paused: true,
    maximumStepsPerFrame: 16,
    enableGpuTiming: true,
  }),
);
const display = scene.primitives.add(
  new C.SceneGISWindVisualization({
    scene,
    simulation: wind,
    mode: "none", // GPU flow particles; use "volume" or "slice" to add tracer display.
    showParticles: true,
    particleCount: 4096,
    particleSize: 0.65,
    particleOpacity: 0.75,
    colorBy: "speed",
    colorMaximum: 5.5,
    extinction: 0.075,
    sliceHeight: 8,
  }),
);
wind.step(1000); // Queue 20 physical seconds; budget still applies.
scene.requestRender();
// Continue requesting frames until wind.pendingTime === 0 in request-render applications.
```

示例中的建筑可视几何需由调用方使用同一份 `polygons` 创建；求解器不会读取场景对象。
`solidMask` 也可以直接传入：`Uint8Array`，每格 0/1，索引 `x+nx*(y+ny*z)`。
输入被复制，构造后修改原数组无效。

## 配置与控制

| 类别         | API / 单位                                                                           | 修改行为                 |
| ------------ | ------------------------------------------------------------------------------------ | ------------------------ |
| 网格         | dimensions，minimum 米，cellSize 米；三轴均不少于 4，最多 2,097,152 格               | 重建实例                 |
| 时间与物性   | timeStep 秒，kinematicViscosity m²/s，smagorinskyConstant                            | 重建实例                 |
| 来流         | windSpeed m/s；windDirection 弧度，从局部 +X 逆时针的**流向**                        | 重建实例                 |
| 初始场与障碍 | initialVelocity m/s；solidMask                                                       | 重建实例                 |
| 边界         | boundaryConditions 六个面                                                            | 重建实例                 |
| 扩散         | tracerDiffusivity m²/s，默认 0                                                       | 重建实例                 |
| 示踪源       | setTracerSources(sources)；球心、半径米，rate 示踪量/秒/流体格，enabled              | 下一物理步生效，不重置   |
| 放置         | modelMatrix 刚性变换                                                                 | 只改变放置，不改变局部解 |
| 调度         | paused，maximumStepsPerFrame（1..64）                                                | 即时控制                 |
| 步进         | step(count)，reset()                                                                 | 下一正常渲染处理         |
| 显示         | show，mode，showStreamlines，colorBy，colorMaximum，extinction，sliceHeight          | 不推进物理               |
| 流线布局     | streamlineSeeds（1..256），streamlineSegments（1..64）                               | 重建显示组件             |
| GPU 粒子     | showParticles（默认 true），particleSize 米（0..4，不含 0），particleOpacity（0..1） | 即时显示控制             |
| 粒子容量     | particleCount（1..65536，默认 4096）                                                 | 重建显示组件             |

默认 `showStreamlines=false`，可显式开启原有瞬时线。`particleTextureByteLength`
返回消费者自有粒子纹理字节数，4096 个粒子占 0.50 MiB；不包含借用的风场或场景后处理目标。
显示组件移除会释放这些资源，不会销毁风场。

`reset()` 清除已有队列、速度、示踪量和模拟时间；紧随其后的 `step(n)` 在重置后执行。
来流、格网、边界等物理快照不能通过运行时赋值偷偷修改。源关闭后，已有示踪量继续输运。
源是格心位于球内的均匀体源，固体不注入；`rate` 不是 kg/s。
无污染物标定的浓度明确称为“示踪量”。

正常 Scene 时间增量累积为待计算时间；预算只限制每帧工作量，不改变 dt 或丢弃积欠。
暂停停止自动累积及自动追赶，但显式 `step` 仍工作。Scene 时间回退触发重置。
`simulationTime` 为已执行固定步的物理秒数，`pendingTime` 包含积欠和手动队列，
`stepsLastFrame` 为最新正常帧实际步数。拾取、阴影和多个显示消费者不增加步数。

## 单位、算法与边界

`uL=u*dt/dx`，`nuL=nu*dt/dx²`，`tau=0.5+3nuL`，格子声速 `1/sqrt(3)`。
构造要求初始速度和规定来流的 `Mach=sqrt(3)*|uL| <= 0.1`，
且 `0.5000001 < tau <= 2`。非法值直接报错，不自动改黏度、夹速度或重置发散。
建筑附近加速可能突破输入时的 Mach 限制，应保留来流余量并查询实际场。
真实空气黏度在粗网格下使 tau 非常接近 0.5；FP32 与未解析壁面均限制精度。

D3Q19 MRT 使用 d'Humières 等的正交矩基，Smagorinsky 默认 Cs=0.12，滤波长度为一格，
不添加随机扰动。无 van Driest 壁面阻尼或壁面模型。可选常量 `acceleration` 单位 m/s²，
使用 MRT Guo forcing，主要用于压力梯度/通道参考算例。
系数、方程和论文见 [ADR-0193](Decisions/ADR-0193-local-urban-wind.md)。

六面名称是 `xMin/xMax/yMin/yMax/zMin/zMax`。模式：

- `wind`：按规定来流法向分量选入口、出口或切向 slip；默认四个水平面如此。
- `inlet/outlet`：必须与该面来流方向一致；入口采用非平衡外推，出口采用一阶对流。
- `wall`：无滑移 halfway bounce-back，默认地面；建筑固体格同样处理。
- `slip`：镜面反射自由滑移，默认顶部；不是大气边界层模型。
- `periodic`：同轴两面必须成对设置，用于参考算例。

斜向风允许同时有两个入口和两个出口；混合开口角点入口优先，多出口相加各法向通量。
开口条件位于最外层格心，wall/slip 在域外侧半格面。出口不能保证完全无反射，
回流不应抵达出口；必须留出下游缓冲并做域尺寸敏感性检查。
本例采用均匀入口，未引入实测大气边界层、热浮力、运动障碍或全球气象。

静态几何入口只接受简单 XY 外环、底顶高度和 geometry-local→simulation-local 刚性变换。
支持凹环和多体并集；拒绝自交、重复闭合顶点、孔洞与缩放。格心在闭合体内即标记固体，
可选 `groundHeight` 增加水平半空间。细于格宽的结构可能漏掉。

示踪量独立采用守恒一阶迎风面通量和中心扩散，固体/wall/slip 零通量，
周期面环绕，开放入口为零背景示踪量，出口零扩散梯度。
`6*D*dt/dx² <= 0.5` 为显式扩散约束；局部输运 CFL 仍须 <=1。
未增加湍流 Schmidt 标量闭合，一阶数值扩散不能解释为物理湍流扩散。

## GPU 场共享与查询

`wind.getGpuField()` 在首次正常更新前为 undefined，其后返回同一 live descriptor。
SDK 新的 GPU 消费者可使用 `SceneGISWindFieldSampling.shaderSource` 与
`createUniformMap(field)`，无需改变既有 VTI `CfdField`。不要将本场每帧导出为 VTI，
也不要重建 Voxel metadata 或回读整场后重新上传。

| 字段                                     | 合约                                               |
| ---------------------------------------- | -------------------------------------------------- |
| velocityTexture                          | RGBA32F：局部 xyz m/s，w 无量纲密度比              |
| solidTexture                             | RGBA8：red 0/1；固体速度为零                       |
| concentrationTexture                     | RGBA32F：r 示踪量，g outgoing scalar CFL，b/a 为 0 |
| dimensions/minimum/cellSize/atlasColumns | 格数、局部起点、米制格宽、图集列数                 |
| modelMatrix/contextId                    | 当前刚性放置与所属 Context 标识                    |
| version/generation/simulationTime        | 已发布版本、重置代数、物理时间                     |

格心位置 `minimum+(cell+0.5)*cellSize`。
三维格 (i,j,k) 的图集像素为 `(i+(k%columns)*nx, j+floor(k/columns)*ny)`；
Z 从 0 开始，图集无 Y 翻转。padding 不属于物理域。
纹理用 nearest；公开 GLSL 的 `sceneGISWindSample(localPosition)` 返回
`vec4(velocity, tracer)`，显式三线性插值并对流体角点权重归一化，固体内部/域外返回零。
此插值用于显示，不是输运算子。

消费者在绑定 uniform 时解析 getter，不能缓存跨交换/重置的纹理身份。
所有纹理归求解器所有；借用者禁止修改或 destroy。先销毁消费者再销毁 producer。
Scene.primitives 默认拥有挂载对象，`remove` 会销毁；不要再次 destroy。

```js
wind.paused = true;
wind.setTracerSources([]); // Stop injection, retain existing tracer.
wind.step();
const sample = await wind.sampleAsync(new C.Cartesian3(30, 0, 8));
// velocity, density, concentration, tracerCfl, solid, cell, version, simulationTime
scene.primitives.remove(display);
scene.primitives.remove(wind);
```

`sampleAsync` 读取调用时状态的最近格心，不会执行尚在队列中的 step。
若要查询新步骤，等待下一次正常 render 完成。最多 16 个并发请求，
用原生 PBO/fence 查询少量像素，超时或销毁显式 reject。

体积和切片透明度来自示踪量，风速/示踪量仅选择颜色。体积射线在不透明建筑/地形深度处结束；
透明物体不作为遮挡。流线采用半格弧长 midpoint 积分，是瞬时曲线，不是粒子轨迹。
默认 GPU 粒子使用原生透明深度/OIT，短轴宽度为 particleSize，长轴随投影风向调整，
最大为宽度的五倍。颜色仍由 colorBy 控制；粒子透明度来自可视化寿命淡入淡出，
粒子数量/密度不代表浓度。位置随机数只用于确定性播种和回收，不扰动速度求解。

粒子读取公开 GPU 场，并用已完成的 simulationTime 推进；暂停冻结、单步推进，
generation 变化重置粒子。RK2 子步不大于物理 timeStep，整段体素遍历阻止穿过固体，
出界或碰撞后重新播种。一帧批量求解多个步骤时，粒子使用该批次**最终速度快照**，
因此非定常流下的粒子轨迹会随批次略变；不能作为精确拉格朗日轨迹或污染物质量输运。
浓度始终来自独立的逐物理步守恒输运。隐藏期间不补算粒子历史。
显示不使用墙钟动画；暂停后的相同视角保持稳定。后处理开关在 preUpdate 同步，
与 Scene 早于 primitive.update 的后处理资源配置保持一致。

## 可复现实例与测量

运行仓库开发服务器，访问：

- 球面：`/Test/Wind/?world=globe`
- 平面：`/Test/Wind/?world=planar`
- 原始求解器计时诊断：`/Test/Wind/solver.html`（仅速度，不包含示踪/显示）

城市案例是 9 栋确定性挤出建筑，显式几何同时用于显示和体素化；无需网络数据。
默认 128×128×32 = 524,288 格，dx=2 m，局部域 256×256×64 m，dt=0.02 s，
来流 3 m/s，空气黏度 1.5e-5 m²/s，Cs=0.12，示踪扩散 0.15 m²/s，每帧预算 16 步。
选择 20/40/80 秒并“计算至此”会重置后推进固定步数。修改方向须按“按方向重建并重置”。

GPU 场共 119.25 MiB：768×768 atlas，11 个速度/分布 RGBA32F、2 个示踪 RGBA32F、
1 个 RGBA8 mask（含 padding）。不包含 Scene、显示后处理、Shader 缓存和临时查询资源。
每步两次 MRT 碰撞输出、一次宏观场发布、一次示踪输运，共四个全图集 draw。

2026-10-28，Windows / ANGLE D3D11 / RTX 3060 Ti 的实际浏览器记录：

| 案例                | 模拟秒 | GPU ms/步中位数 | 批次墙钟秒 | 模拟/墙钟 |
| ------------------- | -----: | --------------: | ---------: | --------: |
| 球面 +X，首次初始化 |     40 |           1.621 |       8.63 |     4.64× |
| 球面 +X，热启动     |     80 |           1.629 |       7.66 |    10.44× |
| 球面 30°，热启动    |     40 |           1.672 |       3.75 |    10.67× |
| 平面 +X，独立运行   |     40 |           1.640 |       4.05 |     9.88× |

W5 改为 4096 个 GPU 粒子后，1575×892 视口、每帧上限 16、粒子宽度 0.65 m：

| 案例              | 模拟秒 | 求解+输运 GPU ms/步中位数 | 批次墙钟秒 | 模拟/墙钟 |
| ----------------- | -----: | ------------------------: | ---------: | --------: |
| 平面 +X，热启动   |     40 |                     1.617 |       3.27 |    12.25× |
| 平面 +X，页面重载 |     40 |                     1.623 |       3.82 |    10.46× |
| 球面 +X，页面切换 |     40 |                     1.627 |       3.90 |    10.25× |

粒子新增 0.50 MiB 状态，每个时间变化的显示帧一次小尺寸 MRT 更新、一次实例绘制。
上述 GPU 查询不包含粒子；墙钟包含粒子更新和显示，不能从跨次墙钟差值推断其精确 GPU 成本。
截图按默认 40 秒复现，保存在本机忽略目录 `Build/wind-evidence/particles-*-40s.jpg`。

计时包围整个固定步批次，包含速度与示踪，不包含显示；墙钟包含页面显示/调度，
首次初始化另含编译分配。只读 `gpuTiming` 返回 millisecondsPerStep、steps、version。
需构造时 `enableGpuTiming:true`，`gpuTimingSupported` 显式报告扩展是否可用。
结果异步发布；disjoint 样本丢弃，不与外部查询嵌套，不用 FPS 替代求解耗时。
不同 GPU、后台标签、并发 GPU 负载和驱动编译状态均会影响墙钟和测量。

40/80 秒 +X 的 8 个局部探针最大 Mach 分别 0.0600/0.0694，密度比范围分别
0.99948…1.00190 / 0.99915…1.00252；平面 40 秒探针结果与球面一致。40 秒斜向为 Mach 0.0907，
密度比 0.99878…1.00207。各次探针示踪有限且非负，CFL <0.082。
40 秒 +X 尾流点 uX=-1.169 m/s，80 秒变为 0.843 m/s；这是未定常局部结果，
不能作为已收敛的平均风压或污染预测。稀疏探针不是全场稳定性证明。

## 验证边界

自动化覆盖正交矩基、碰撞质量/动量、均匀周期/斜向开放流、剪切衰减、
强迫 Poiseuille 参考解、建筑尾流/固体边界、下游长度敏感性、示踪守恒/扩散/
固体隔离、暂停/重置/同帧去重、异步查询、双世界遮挡和资源释放。
Poiseuille 8/16 格相对 L2 误差分别 <4%/<1.2%，细网格更小；
24/32 长度障碍算例的尾流探针差异 <8% 来流速度。
这些是有限参考检查，不构成复杂城市 LES 的网格独立性、实测验证或工程认证。

阶段记录见 [AgentDocs/urban-wind](../../AgentDocs/urban-wind/README.md)。
代码全部位于 SceneGIS-owned 区域；本扩展未修改 upstream-owned 文件，SGP 无。
