# 平面相机 Roll 与导航接管

- Type: standalone plan; status: completed technically, owner visual confirmation pending; updated: 2026-10-22.
- Owner / architecture / execution / review: current task, self-review.
- Parent: [扩展索引](../README.md).
- Baseline: `scenegis/develop@29bb119e3f`.
- Related: ADR-0004 / ADR-0024 / ADR-0026 / ADR-0037 / ADR-0079.
- Upstream-owned files / SGP: None planned.
- Review: [技术自审](../reviews/2026-10-22-camera-roll-navigation.md).

## 已确认问题与授权

Camera 的 setView、HPR 和 flight 已支持 roll。Controller `_syncRig` 却将非零
roll 判为 invalid，surface 模式调用 Home，underground 模式拒绝接管。旧 Spec
明确锁定了 rolled pose 的 wheel → Home 行为；此处是早期导航策略，不是投影限制。
负责人确认：保留程序和 idle 姿态，pan / wheel 保留 roll，中键围绕既有锚点扶正。

## 实现

1. `_syncRig` 接纳合法 rolled orthonormal pose，保存 signed roll；保留 target、pitch、
   terrain-side 与 clearance 检查，Home 仍按显式操作或其他既有 invalid 条件执行。
2. 中键保持 press-time pivot/window anchor/distance。零 movement 不改变 roll；每次
   normalized mouse angular travel 使用现有 ROTATE_RATE，最多消除等量 signed roll，
   最短方向收敛到 0。使用完整 HPR 构造 axes，再由既有 window-anchor 方程计算位置。
   不增加 timer、idle animation、public rate 或额外 picking。
3. 惯性沿用同一 roll/pivot 状态，外部 pose/new press/flight 等保留既有取消机制。
   手势结束可保留尚未消除的 roll；后续中键继续扶正，pan / wheel 不代替用户扶正。
4. Underground tangent release 的已有微量 pitch 修正必须保留剩余 roll。Nadir 的
   heading/roll 不唯一，沿用 public Camera 等价姿态分解，不强制恢复原始 Euler 数值。
5. 不改变 surface endpoint clearance、pitch limit、pan/wheel boundary、有效锚点
   orbit 的无界 center target。碰撞校正仍优先，任意 free-look/swept collision 不在范围。

## 验证与边界

- 先复现旧行为：initial/idle rolled pose、pan/wheel preserve、zero-delta orbit、
  continuous unroll / pivot projection、signed roll / nadir / non-identity transform。
- Controller suite 覆盖 Perspective / OffCenter / Orthographic，惯性与再次拖动、
  地表防穿透、地下 crossing/tangent；保留已有高空 extent 外旋转回归。
- Public Camera/flight 与真实 terrain navigation 的最小相关 suite；无需 Shader/release
  矩阵。没有公共属性新增，不修改生成器或 upstream。
- 独立浏览器页面真实 mouse 输入，检查 rolled grid、平移/滚轮、中键扶正、惯性及再次
  拖动，包含正交与大坐标/高空场景；截图视觉检查。保持用户现有页面不变。
- Scoped lint / formatting、AgentDocs 必需检查、patch audit；补齐 ADR/guide/review。

## Gate

非零 roll 本身不再造成 Home 或输入失效。扶正仅在中键有效位移/惯性发生，锚点与
轨道约束符合原契约，无零位移跳变或额外资源。负责人视觉反馈独立记录。

## 实际结果

产品修改仅 controller；修正 non-zero-roll admission 与 new-press inertia running 状态。
70 Controller + 18 Camera API + 9 flight + 5 real terrain/depth navigation Specs 通过。
两种投影真实 mouse E2E 通过并检查截图，包含 flight 后 roll 保留、连续扶正、惯性与再次
press。无新增 public API、upstream/SGP 或生成物修改；无 Shader/release 矩阵扩展。
详细证据、边界及待负责人视觉确认见 review。
