# 可旋转喷口与破口演示评审

- Type: review
- Status: resolved
- Author / owner: current task / architecture self-review
- Updated: 2026-10-23
- Target: [可旋转喷口计划](../plans/2026-10-23-oriented-emitter.md)
- ADR: ADR-0187
- SGP: None

## 契约与实现

默认单位四元数保持原有喷泉行为；喷口旋转只作用于新生圆盘和初速度，位置、重力、
容器及既有粒子沿用模拟坐标。校验单位四元数和旋转圆盘投影范围，构造时复制调用方输入。
运行时原地修改不重置求解器，缓存 Matrix3 uniform，无新增 pass、GPU 目标或回读。

新增独立管道破口示例，空心管壁真实开口与喷口同步旋转，提供仰角、速度、发射率、
粒子半径、暂停、泄漏启停与重置。Planar 与 Globe ENU 共用同一模拟配置。
Viewer / GUI 沿用 example-lifecycle 的销毁协议，PrimitiveCollection 拥有管壁与流体资源。

## 验证

- 严格 WebGL `SceneGISFluid`：15/15 通过（10 primitive + 5 solver）。
- 新增 GPU 数值验证：两种朝向的圆盘位置和速度、既有粒子速度不旋转、重力保持 -Z、无回读和资源复用。
- 新增公开属性验证：输入复制、非法四元数、旋转后可容纳 / 越界的圆盘、运行时校验与不 reset。
- `build-release`、`build-ts`、`tsc` 通过；类型生成保留既有上游 JSDoc 警告，无新增流体警告。
- 修改范围内 ESLint / Prettier、文档 markdownlint、diff whitespace 检查通过。
- Chrome 155 实际 Planar / Globe 页面无 console warning/error；可见连续射流和接水。
  仰角切换及泄漏开关生效，Globe 暂停后 reset 游标归零，恢复后重新连续发射。
- 性能边界：仅出生粒子增加两次 mat3-vector 乘法；现有 GPU capacity 测试通过。
  targets 身份保持不变，不宣称新的跨设备帧率保证。

## 结论与边界

未发现本次扩展的未解决代码问题，可以交付项目负责人视觉验收。只修改 SceneGIS-owned
文件，无 upstream-owned files、SGP、SDK 或生成文件提交。原喷泉保留。
仅演示外部射流；管壁不参与碰撞，仍是闭合盒碰撞及屏幕空间前层水面近似，不求解管内压力。
本次改动保持未提交，等待项目负责人验收。
