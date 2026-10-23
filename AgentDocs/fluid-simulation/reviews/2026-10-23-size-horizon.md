# 粒子大小与地平线修复评审

- Type: review
- Status: resolved
- Author / owner: current task / architecture self-review
- Updated: 2026-10-23
- Target: [standalone plan](../plans/2026-10-23-size-horizon.md)
- ADR: ADR-0187
- SGP: None

## Findings

### F1 / P1 / fixed：clear-depth 背景丢失

Deferred water color 与共享 SSR radiance 只含 opaque，悬空流体将清空区域当成黑色透射。
Fluid 显式请求背景，复用主 HDR 颜色捕获与 WaterFrame 原有优先级；opaque depth 不变。
新增独立捕获、共享 SSR 的 clear-depth 红色背景测试先失败再通过；低视角真实天空截图
确认黑色截断消失，既有遮挡 / Globe / TAA 与 17 项 WaterSurface 回归通过。

### F2 / P2 / fixed：粒子大小无法实时修改

公开 `renderRadius` 可写属性，校验范围后更新重建半径与包围体；既有 uniform 自动读取。
暂停时改变可见面积，缩回时包围体无漂移；测试确认没有 reset、step 或新纹理分配。
JSDoc、开发指南、生成类型和示例控件同步，完整 release build / build-ts / tsc 通过。

## 资源与性能

每帧没有 CPU 粒子回读。默认喷泉沿用已有一次 copy / water target，共享 SSR 增加一次
全屏 copy 和对应 mipmaps；Scene-owned RGBA16F 捕获占约 `width * height * 8 * 4/3` bytes。
Chrome 155 / Windows headless Specs 核对每帧一次执行、纹理稳定复用、Scene 销毁释放；
浏览器实际天空预览未出现控制台错误。此处是 draw / memory 对比，不宣称固定帧率。

## 结论与剩余边界

变更仅在 SceneGIS-owned 文件，无 SGP、无 SDK 修改。允许交付。
全量 AgentDocs markdownlint 通过；Prettier 全量仍有 569 个既有文件告警，修改范围内检查通过。
屏幕空间首层透射、容器碰撞和水下相机限制继续沿用 ADR-0187；最终外观由项目负责人判断。
