# 程序星空技术自审

- Type: architecture/code review; status: technical gate passed; owner visual acceptance pending
- Date: 2026-09-30; reviewer/implementation owner: 当前 Agent
- Target: [standalone plan](../plans/2026-09-30-procedural-stars.md)
- ADR: [ADR-0107](../../../Documentation/SceneGIS/Decisions/ADR-0107-atmosphere-stars.md)
- Upstream-owned files / SGP delta: none; existing SGP-0008 consume-only

## 结论与发现

| 检查项                         | 严重度 | 处置与证据                                                                                                                        |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 星图带来额外网络与 24 MiB 纹理 | P2     | fixed；删除六张星图请求和 cubemap，固定种子 buffer 为 98,304 bytes，quad 为 32 bytes；API/E2E 确認零星图请求。                    |
| 亚像素星点闪烁风险             | P2     | fixed；连续 cubic B-spline PSF 保持能量，实际 GPU 在四个亚像素相位的积分误差仅在 RGBA8 量化容差内。没有 history、噪声或闪烁动画。 |
| 星光绕过雾或改变背景 alpha     | P2     | fixed；双世界 GPU 检查暮光、地面、太空及雾消光，像素积分测试同时检查 alpha 不变；浏览器确认云层遮挡。                             |
| 星位精度                       | P3     | accepted；负责人允许模拟星位；API 与示例明确不对应真实星座，保留时间旋转而不声称天文目录精度。                                    |
| 正交相机的离散远距星点         | P3     | accepted；平行射线没有角视场，正交不绘制离散星点，已在 API/ADR 说明并覆盖 draw gate。                                             |

## 验证

- 8 项星空 Specs + 5 项既有异步加载/失败/释放回归，development 和 release 各 13 项全部通过，
  开启 WebGL validation。无 shader 或资源释放错误。
- 双世界 Night stars E2E 通过：Globe 32.7 s，Planar 22.1 s；本地资产、开关、时间、相机和销毁正常。
- buildRelease、buildTs、tsc 与 scoped ESLint 通过。没有手改或提交生成产物。
- 视觉检查球面夜空、云遮挡及平面地平线；独立示例继续使用同一入口。
- 当前 14 个改动路径与官方基线核对：upstream-owned=0、generated=0，diff whitespace 检查通过。
  AgentDocs 全量 Markdownlint 通过；Prettier 的 319 个既有格式问题未在本任务扩散修改，
  本次文档的单独格式检查通过。

## 性能与生命周期

RTX 3060 Ti / ANGLE D3D11，1001×826，球面固定夜空、云/高度雾关闭。
GPU timer 包围整个 renderBackground（包含星点 draw），关闭/开启各 32 个样本：
median 0.119808 / 0.123904 ms；mean 0.121632 / 0.126176 ms，新增约 0.0041 ms。
该设备/场景结果不能外推整帧或移动端性能；与旧版 1185×667 测量不作直接性能比值。

创建失败由 candidate 回收已建资源；VAO 获得 buffer 所有权后清空临时独立引用，避免重复销毁。
昼夜/开关不创建新资源，关闭 showStars、强度零或正交均不提交 star draw。
不增加 texture、framebuffer、CPU 每帧星点更新或异步 generation。原生 SkyBox 资产不受影响。

## 剩余边界与交接

技术 gate 通过；最终星点密度、亮度和整体观感交负责人验收。
模拟星位、没有银河和星座、正交不绘制离散星点均为明确范围。
历史 Globe aerial 的 owner gate 继续保留，不由本项关闭。
