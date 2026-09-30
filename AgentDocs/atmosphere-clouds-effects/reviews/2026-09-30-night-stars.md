# 夜晚星空技术自审

- Type: review; status: code approved; owner visual acceptance pending
- Date: 2026-09-30
- Reviewer / implementer: 当前 Agent（技术自审，非独立评审）
- Target: [standalone plan](../plans/2026-09-30-night-stars.md)
- ADR: [ADR-0107](../../../Documentation/SceneGIS/Decisions/ADR-0107-atmosphere-stars.md)
- Upstream-owned files / SGP delta: none; existing SGP-0008 consume-only

## Findings

| Finding                                                    | Severity | 处置与证据                                                                                             |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| 物理天空未包含原生星图                                     | P2       | fixed；在 existing background 中采样线性星光，Globe / Planar 实际画面和 GPU Specs 通过。               |
| Globe 散射的 horizon clamp 不能遮挡星光                    | P2       | fixed；以真实光学球求交作独立遮挡，向下 GPU 像素为零，不改散射函数。                                   |
| Planar 小 mip 上传保留 base unpack alignment，缓冲长度不足 | P2       | fixed；按真实 stride 分配初始化缓冲，两次 world 资源发布及 WebGL validation 通过；没有修改 Texture3D。 |
| Planar 示例初始仰视超出 surface navigation 的有效 pitch    | P2       | fixed；示例改为既有有效的 −5°，E2E 确认相机 Z=200，不重置为 home，不改相机功能。                       |

## 验证与架构检查

7 个新 Specs 验证线性色彩、昼夜/暮光、强度/开关、地平线、雾、太空、Clock/ENU 方向、
异步失败和过期 generation、暖切换和销毁。5 个既有资源生命周期回归通过；release 总计
12 项通过。两种示例使用本地资源、公开 API 和正常导航，E2E 通过；页面关闭释放星图。
发布构建、类型生成和完整类型检查通过，scoped lint/format 与 ownership audit 结果见交接。

最终 ownership audit 通过：current delivery upstream-owned entries 0、generated status 0。
Scoped ESLint / Prettier、git diff --check、全量 AgentDocs Markdown lint 通过。
按规则执行全量 AgentDocs Prettier，319 个未修改历史文件仍有格式问题；本项文档通过，未扩展清理。

无额外 command、FBO、history 或几何绘制。没有系统时钟、CRS 推测、隐式全局缓存或原生
SkyBox 重新启用。图片在现有 CPU generation 请求，CubeMap 在原子同步发布中创建，并由同一
resources owner 释放。默认 disabled 没有请求；active 下开关复用 24 MiB 纹理。
背景强度独立于物理辐射定标，不影响天空光/地表/反射源。云雾复用已有合成顺序。

## 性能与剩余边界

实测固定 Globe 夜空背景通道，RTX 3060 Ti / ANGLE D3D11，1185×667：
GPU timer 关闭/开启各 32 个样本，中位数 0.090 / 0.166 ms。没有整帧加速承诺。
复用 1024² 原生星图；星点清晰度和细节受该资源限制，不是高精度天文目录或动态闪烁。
手动 Planar 为固定世界方向，不宣称天文学方位准确。视觉接受仍由负责人决定。
历史 aerial visual gate 保持原有状态。本项无未解决代码阻塞项，不启动后继阶段。
