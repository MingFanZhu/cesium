# Extension Plan: Native Fluid

- Type: extension; Status: completed; Created / Updated: 2026-10-23
- Owner / architecture review: current task, confirmed scope; self-review
- Baseline: `14bf727b70`; branch `feature/native-fluid`
- Discussion: [algorithm](../discussions/2026-10-23-algorithm.md)

## Objective and boundaries

实现局部喷口、小型水池、简单容器中的真实 GPU 流体，提供可直接加入 PrimitiveCollection
的原生 API。模拟、邻域查询和液面重建不做运行时 CPU 回读；支持球面 ENU 与平面米制刚体变换。
连续发射、暂停、重置、容量、步进及资源销毁必须明确。引擎能力供 SDK 独立流体喷泉调用，
保留现有粒子系统。项目负责人于 2026-10-23 明确要求本任务不修改 SDK；原计划 P3 移出范围。

复用 Cesium WebGL2 renderer 与水体场景捕获，不引入第二后端、不依赖未合并 WebGPU 分支。
模拟不以场景深度冒充容器碰撞；首版显式局部闭合盒容器边界。光学允许屏幕空间近似，
不承诺离屏几何、递归透明、摄像机进入液体或科学级不可压缩性。

## Phase roadmap

| Phase                              | Goal                                    | Dependency    | Exit                                                        | Status    |
| ---------------------------------- | --------------------------------------- | ------------- | ----------------------------------------------------------- | --------- |
| [P1](2026-10-23-p1-gpu-solver.md)  | GPU 邻域 / 密度求解，数值与性能选择算法 | existing MRT  | 实测数值、发射碰撞、释放、预算；review 与独立提交           | completed |
| [P2](2026-10-23-p2-surface-api.md) | 原生图元 API、连续液面与水体合成        | P1 checkpoint | 双世界 GPU / 视觉 / 遮挡 / 生命周期，完整构建类型及独立提交 | completed |
| P3                                 | SDK 独立喷泉示例和交付资格              | P2 checkpoint | 项目负责人明确由调用方负责；本任务未激活或实施              | excluded  |

未来阶段实施细节在进入时由当时源码确定，不跨阶段提交。没有独立 reviewer，当前任务执行
architecture self-review；最终画面保留负责人视觉判断。

## Acceptance and risks

密度约束必须产生可测的粒子相互作用，GPU 邻域须与独立 CPU 参考一致，不能使用固定槽位
邻居截断来掩盖溢出。默认预算以本机实际 GPU 数据确定。数值回读仅出现在 Specs / 测量工具。
可见喷流应形成连续水柱、水团与飞溅，实际场景遮挡和深度正确，暂停/重置/销毁可重复。
分配由容量与屏幕尺寸确定，常规帧不新增 shader / texture / CPU 粒子数组。
SDK 工作区已有大量其他未提交工作，必须保持，禁止整仓提交或重置。

引擎交付已完成：P1 `e2fb6a0dee`、P2 `fc0cbc030e`。求解器 4/4、图元 5/5、
既有水体回归 17/17，release 流体 9/9；完整构建、build-ts、tsc 通过。
SDK 只进行了只读调查，没有修改、导入引擎、构建或提交 SDK 文件。
