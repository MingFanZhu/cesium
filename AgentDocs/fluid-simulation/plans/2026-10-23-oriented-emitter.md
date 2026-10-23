# 可旋转喷口与管道破口演示

- Type: standalone plan
- Status: completed
- Author: current task / architecture and execution
- Updated: 2026-10-23
- Parent: [首版](2026-10-23-native-fluid.md)（已完成）
- ADR: ADR-0187
- SGP: None

## 当前事实与设计

Predict shader 将出生圆盘固定在局部 XY，直接使用 emitterVelocity。
新增可变 `emitterOrientation: Quaternion`，默认 IDENTITY；表示喷口坐标到模拟局部坐标的旋转。
只旋转新生圆盘偏移和 emitterVelocity，不旋转 emitterPosition、重力、容器或已有粒子。
默认值保持现有调用兼容。校验单位四元数，并用旋转后圆盘在各轴上的投影范围检查容器边界。
Solver 每次 predict 使用一个缓存 Matrix3 uniform，无新增 GPU target、pass 或运行时回读。

## 范围与步骤

1. 增加公开属性、JSDoc、校验及 GPU 发射旋转。
2. Specs 核对旋转出生圆盘/速度、既有粒子与重力不旋转、边界与非法四元数。
3. 新建独立 `Test/Rendering/水管破洞喷射.html`，支持 Planar / Globe ENU，保留原喷泉。
   管壁破口几何与喷口同步朝向；控制角度、速度、泄漏启停、暂停和重置。
4. 严格 Fluid Specs、release build、build-ts / tsc、实际页面视觉与交互验收。
5. 更新 ADR / 开发指南、review 和扩展索引。

## 边界与风险

仅做外部参数驱动的泄漏演示，不求解管内压力/水锤；继续使用闭合盒容器碰撞。
管道展示几何参与可见遮挡，喷口布置在管壁外侧，不扩展任意 mesh 碰撞。
不修改 SDK、上游文件和原粒子喷泉。本阶段不自动提交，等待项目负责人验收。

## 实施结果

上述步骤已完成，无设计偏差。严格 Fluid Specs 15/15，release build、类型生成和 tsc
通过；实际 Planar / Globe ENU 页面与角度、启停、暂停、重置交互通过检查。
新增 API 不增加 GPU pass、纹理或运行时回读。详见 [评审](../reviews/2026-10-23-oriented-emitter.md)。
已完成实现与自评，保持未提交，视觉质量最终以项目负责人验收为准。
