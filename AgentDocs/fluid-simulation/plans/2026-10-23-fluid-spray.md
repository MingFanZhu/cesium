# 次级飞沫与喷流细节

- Type: standalone plan
- Status: completed
- Author: current task / architecture and execution
- Updated: 2026-10-23
- Parent: [首版](2026-10-23-native-fluid.md)（已完成）
- Previous: [表面重建](2026-10-23-fluid-surface-quality.md)
- Architecture review: confirmed
- ADR: ADR-0187
- SGP: None

## 源码事实与范围

当前 PBF 只有主液体；所有粒子统一参与平滑的等体积椭球重建，缺少毫米级飞溅。
现有 lambda target 已含密度，predict / finish 保留碰撞前后速度；可以在 GPU 上产生
次级喷雾，不需要 CPU 回读、原子散写或修改主求解器的质量。前轮未提交工作全部保留。
本轮为可一次验证的视觉增强，不变更 SDK、上游、任意网格碰撞或主模拟算法。

## 设计

1. 可选 sprayIntensity [0,4]，默认 0；首次启用懒建与主粒子同容量的次级池，
   两套 position/life、velocity/initialLife 浮点 MRT，共 64 bytes/slot。
   每槽固定对应一个主粒子候选，已有飞沫不被覆盖；失活槽根据速度、表层密度和
   碰撞速度变化进行按固定 dt 的概率出生。GPU 整数 hash 保证 reset 可重复。
2. 飞沫使用独立重力/空气阻力、有限寿命；碰撞容器或重新进入高密度液体时回收。
   每次主模拟步后执行一次粒子规模 pass；0 停止生成并隐藏、继续老化已分配池，
   暂停/隐藏随主模拟冻结，reset 清空，销毁释放。不做泡沫/气泡或双向质量交换。
3. 独立透明 instanced quads 以细小水滴/短运动拖影显示，复用场景透明阶段、HDR
   光源与水体遮挡。软边缘、透明高光，不参与液面深度平滑或厚度累加。
   公开 sprayParticleRadius（米）控制视觉大小，有限范围保持 culling 包围体有效。
4. 破管示例启用飞沫，提供强度/大小对比；主液体半径回到接近 rest spacing 的
   默认值，减少体积膨胀。保留原喷泉和当前方向 API。

## 验证

- Specs：GPU 出生条件、弹道/回收/reset/资源、无回读；公开参数、暂停/隐藏、双世界
  opaque 与水体遮挡、透明路径的真实画面。避免为了证明工具而堆叠组合。
- 本地破管暂停开关与运行画面检查，原喷泉回归；本机开关 GPU timer 有界对比。
- 完整 release、build-ts/tsc，相关 ESLint/Prettier/Markdown，所有权审计。
- 回写 ADR、指南、review、索引。视觉仍由项目负责人判断；飞沫为次级视觉近似，
  不将其描述为增加主液体的物理分辨率或影视级解法。

## 结果

固定容量 GPU 飞沫池、独立透明绘制、软遮挡与示例对比控制已完成。
24 项严格 Fluid Specs、release build、build-ts / tsc 和 scoped ESLint 通过。
Planar / Globe 破管及原喷泉已检查，无浏览器错误。额外飞沫池 512 KiB，
本机开关整帧 GPU 中位 2.648 / 3.172 ms，详细条件与边界见
[评审](../reviews/2026-10-23-fluid-spray.md)。保持未提交，等待负责人视觉验收。
