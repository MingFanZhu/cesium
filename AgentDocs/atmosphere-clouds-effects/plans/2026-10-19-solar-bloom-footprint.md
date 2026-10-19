# 双世界太阳泛光形状修复

- Type: standalone plan
- Status: implementation verified；负责人视觉判断保留
- Owner: 当前任务，Architecture / execution
- Created: 2026-10-19；Updated: 2026-10-20
- Architecture review: confirmed；先以当前太阳视角复现，再修正有限模糊支撑
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- ADR: [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)
- Upstream-owned files / SGP delta: none

## 已确认事实

综合环境 Globe 页面在 HDR / PBR Neutral、exposure 1、bloomIntensity 0.05 时出现圆角方形光斑。
固定相机与时刻关闭 showBloom 后，太阳本体保持圆形，镜头光晕仍开启。
现有 Globe 使用半分辨率上的 1/2/4 三组水平 / 垂直有限模糊；Planar 已在 P3 中
改为六个均匀方向和 sqrt(7) 半径，避免同一高亮有限支撑问题。两者无需世界几何差异。
旧 GPU fixture 只有 32×16，虽验证线性加法与模糊扩展，但边界小于完整光斑，不能验证等亮轮廓。

## 范围和实施

1. 新增足够宽的真实 GPU 太阳圆盘回归，以多个方向的等亮轮廓约束方形失真，同时检查恒定场增益。
2. 先确认旧 Globe 失败、既有 Planar 通过，再统一使用已验证的六方向调度；不改太阳辐射或 Shader。
3. 保留六次 blur、两个半分辨率 ping-pong 目标、既有 composite、阈值、alpha、遮挡与生命周期。
4. 同视角对比原强度与较低强度；强度偏好与形状修复分开记录，不暗中缩放太阳能量。
   负责人明确要求同步降低引擎默认值：0.05 → 0.005；显式全场景参数，不改变太阳源。
5. 运行新回归与现有 bloom / lens / 生命周期相关 Specs、开发构建、scoped lint / format。
   同场景检查实际画面及 GPU 成本，恢复相机、时钟与非相关环境设置，形成评审。

## 验收与边界

两世界高亮圆盘的等亮轮廓不再呈轴向方形，恒定输入的线性增益不变；当前太阳视角可复核。
不增加采样、资源、pass、公共 API、俯角阈值或太阳专用隐藏倍率。
视觉强度仍是显式 bloomIntensity，不由几何回归代替负责人判断。

## 实现结果

旧 Globe 轮廓回归失败、Planar 通过；统一六方向后两世界通过。默认强度按负责人要求改为 0.005。
六项相关 Specs、开发 / 发布构建、类型与静态检查通过；同视角与双世界画面、性能边界见
[技术评审](../reviews/2026-10-19-solar-bloom-footprint.md)。没有新增 Shader、API、资源或 upstream / SGP。
当前页面保留新强度与原相机 / 时刻 / 图层。2026-10-20 负责人要求提交，本次将实现、Specs、ADR 与交接记录形成独立本地提交，未推送；不将提交授权记为新增的视觉验收结论。
