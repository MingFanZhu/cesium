# 高质量球面云历史支持评审

- Type: review
- Status: completed; owner approved the current cloud-quality checkpoint on 2026-10-26
- Author: implementation / architecture self-review; updated 2026-10-26
- Target: [standalone plan](../plans/2026-10-26-high-cloud-temporal-support.md)
- Policy: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md#2026-10-26-full-resolution-globe-temporal-support)
- Product delta: `SceneGISEnvironmentEffectsCloudResolveFS.glsl` and producer receiver publication
- Upstream / SGP increment: none; preceding uncommitted startup changes are preserved.

## Findings

- **HCT-001 / high / fixed / implementation:** high 把随机体积深度当作固定表面，
  原视角仅 18.2% 的云像素接受历史。全分辨率 Globe 复用既有体积支持规则；
  新 GPU witness 验证 1 km 随机 mean 变化仍按 0.9 累积，恢复旧策略会失败。
- **HCT-002 / high / fixed / implementation:** high 混合邻域 receiver distance，
  且缺少几何合格邻域。当前像素深度独立发布，遮挡轮廓两侧筛选统计 / 光学 / 云 anchor；
  新 GPU witness 覆盖前景、错误 receiver、斜面 metadata 与移动时不支持的深度。
- **HCT-003 / medium / accepted / project owner:** 当前画质检查点验收。
  负责人反馈薄边仍抖动后已完成 HCT-006 修复；2026-10-26 要求提交当前云优化。
  接受该有边界的结果，仍不能承诺有限采样下的薄边、快速运动完全无颗粒 / 残影；
  HCT-004 / HCT-005 的 fixture 维护事项不随提交关闭。
- **HCT-004 / medium / retained / atmosphere maintenance:** 旧综合 radiance/history
  fixture 的 strict-WebGL background draw 仍报 `INVALID_OPERATION`。
  此失败类型在 [Oct 2 review](2026-10-02-cloud-taa-registration.md) 已记录；本轮不作为通过项，
  也不扩展到背景管线修复。独立新 GPU fixture 使用 strict validation 并通过。
- **HCT-005 / medium / retained / atmosphere maintenance:** 旧 phased 综合 fixture
  的 depth-roundtrip mutation 仍匹配旧 builtin，same-UV mutation 未覆盖 fractional
  history 坐标，故负控失效；最后也遇到上述 background draw 错误。
  未改变这些已过期探针的断言或声称整项通过。更小的双世界 receiver motion / jitter
  strict-WebGL 回归通过；后续维护应更新旧探针和背景 fixture，再运行该综合项。

## 真实页面证据

Windows / Chromium 155 / ANGLE D3D11 / RTX 3060 Ti，1001x826；Globe high，
积云，coverage 0.3、density 1、base 750 m、thickness 4500 m、radiance 1；
原相机、暂停时间、cloudTime 0。临时诊断只在当前 resolve draw 内执行旁路，不改 native 输出。
候选使用独立 ping-pong history；同帧两者共享 trace/depth/camera，40 帧中后 24 帧用于统计。

采样区域为 drawing buffer `(400,300,400,250)`，合计 1107082 次 opacity > 0.03
的像素转换；亮度为线性 RGB luminance 的 `L/(1+L)` 压缩值。

| 指标                           |        原版 |        候选 |
| ------------------------------ | ----------: | ----------: |
| 平均相邻帧压缩亮度差           |    0.035107 |    0.011059 |
| 平均相邻帧透明度差             |    0.050967 |    0.022283 |
| 24 对 GPU timer resolve 中位数 | 0.763904 ms | 1.032192 ms |

亮度波动下降约 68.5%，透明度波动下降约 56.3%，resolve 额外约 0.268 ms。
交替两 draw 顺序；timer 无 disjoint，GL error 0。这是局部时间稳定性和单 pass 成本，
不是整场景 FPS、绝对画质或任意视角结论。

实际构建刷新后，32 次 camera 20 m/frame + 0.0015 rad/frame、原生 Clock
每帧推进 0.5 s 的检查中，cloudTime 为 0..15.5 s，32/32 为 continuous-reprojected，
GL error 0。另一个相机路径的 33 次 resolve 中位数 1.070 ms、p90 1.106 ms；
此路径的云时钟锚点不同，不作同输入性能差值。所有查询、临时 textures/framebuffers、
program 引用、回调均释放；原相机、暂停日期和 cloudTime 0 恢复。

截图和测量原始数据仅放在 ignored `Build/`，不进入 AgentDocs 或提交。
浏览器控制台无 warning/error。未新增产品 CPU readback、资源或 pass。

## 自动化与边界

- 新 `SceneGISCloudHighQuality` 三项 strict-WebGL GPU Specs 通过。
- 两项 strict-WebGL 回归通过：双世界 moving receiver parallax / bilinear history
  （87.604 s）、stationary jittered sloped receiver（0.313 s）。
  旧独立 receiver fixture 补齐现有 linear-depth uniforms，mutation 跟随 helper 名称；
  不改其遮挡、相位或像素断言。
- `isolates cloud radiance scale transitions from temporal history` 普通 WebGL
  通过（105.727 s）。High 的旧固定表面断言改为 current-domain projected metadata，
  透明 history 使用真实 transparent RGBA；clear receiver 保留 sentinel 1，
  显式准备切换正交视图所需的 linear-depth resolve。保留空间 / 历史、相机 cut、
  错 UV、shadow packing 和销毁检查。Strict 版本仍受 HCT-004 限制。
- 以上合计 6 项通过，其中 5 项 strict-WebGL。旧 phased 综合项的失败单列于 HCT-005，
  不做整套云测试全通过声明。
- scoped ESLint / Prettier、AgentDocs Markdownlint、whitespace 通过。
  全 AgentDocs Prettier 仍有与前一轮一致的 595 个既有文件告警；新增记录通过 scoped 格式检查。
- `npm run build-release` 通过（15 s）；构建后实际页面重新加载、ready、high、cloudTime 0。
- 没有 API/type 变动；沿用前一轮已通过的类型生成与检查。
- 不改变 low / Planar 策略；medium 使用原有 phase、几何规则和权重。
- high 空间核保留，统计与光学输入现在都必须通过 receiver / 前景筛选；
  不靠新增全屏模糊、冻结噪声或削减采样实现降噪。

## 薄边反馈与修正

- **HCT-006 / high / fixed / implementation:** 上一轮 high 集成遗漏了 producer
  receiver 发布。`sceneGISMarchClouds` 的 miss 保留 z = 0，只有 phased 在末尾覆盖
  receiver；新的 high resolve 因而把透明邻域当作错误地表排除，历史裁剪只剩命中样本。
  原页面一个薄边样本把透明历史直接裁成 opacity 0.837。已在全分辨率 producer 补齐
  receiver，与 resolve 的 full-resolution/phased 判别保持一致；保留 xy、validity 和 shadow。
  Reduced unphased Globe 保持原行为；无新 upstream / SGP。
- 新 publication GPU fixture 执行产品末尾发布代码，输出附件直接供真实 resolve 使用；
  覆盖 high / phased / reduced-unphased、clear sentinel、shadow 保留，以及一命中八透明的
  稀疏边缘、下帧中心 miss、完全无支持、前景遮挡。恢复旧 publication 的负控重现
  opacity > 0.7 的厚边。此前 fixture 总是假定 miss 的 receiver 正确，未覆盖这条集成缝隙。
- `SceneGISCloudHighQuality` 共五项 strict-WebGL 通过（35.2 s）；本轮不重复旧大 fixture。
  先前六项验证与 HCT-004 / HCT-005 维护限制仍按上文保留。

同一用户视角 1001x826、Globe high、cloudTime 0。旧 / 新 producer 每帧使用相同
uniforms、STBN、depth；各自独立历史，40 帧中前 8 帧累积，后 32 帧测量。
区域为 drawing buffer `(400,320,160,160)`；按新结果相邻帧最大 opacity 在
0.015..0.4 选取薄边，共 50435 个像素转换。RGB luminance 使用 `L/(1+L)`。

| 指标                         | 修正前   | 修正后   |
| ---------------------------- | -------- | -------- |
| 平均相邻帧 opacity 差        | 0.059012 | 0.009294 |
| 平均相邻帧压缩 luminance 差  | 0.030284 | 0.005316 |
| opacity 单帧跳变 > 0.1 次数  | 9292     | 258      |
| 32 对 trace GPU 中位数（ms） | 6.947840 | 7.026688 |

薄边 opacity / luminance 波动下降约 84.3% / 82.4%。Trace draw 顺序交替，timer 无
disjoint，GL error 0。时钟、相机和 material 不变；没有增加采样数。该局部统计不能替代
项目负责人的视觉验收，也不代表所有视角或整帧性能；残余有限采样噪声仍可能存在。

`npm run build-release` 通过（15 s），scoped ESLint 通过。实际页面刷新构建后，
20 帧移动检查为 1 次 stationary + 19 次 continuous-reprojected，cloudTime
0..4.75 s，GL error 0；原相机、暂停日期、high 和 cloudTime 0 已恢复。
临时 draw wrappers、查询、framebuffers / textures / program 引用均已清理。
本轮不修改 SDK，不自动提交；仅在 ignored `Build/` 留诊断脚本、截图和测量。
修改文档的 scoped Prettier、全 AgentDocs Markdownlint 和 whitespace 通过；
全 AgentDocs Prettier 仍有 594 个既有文件告警，本次修改的记录均已格式化。

2026-10-26 负责人要求本地提交当前结果，本项与后续材质连续性及 medium 重建修复
纳入画质检查点；不提交诊断产物、不推送，不扩大已有验证声明。
