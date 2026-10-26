# 中质量云重建去颗粒评审

- Type: review
- Status: completed; owner approved the current result for commit on 2026-10-26
- Author: implementation / architecture self-review; created 2026-10-26
- Target: [standalone plan](../plans/2026-10-26-medium-cloud-reconstruction.md)
- Policy: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Product delta: Globe phased spatial weights in `SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- Upstream / SGP increment: none; previous uncommitted changes preserved.

## Findings

- **MCR-001 / medium / fixed / implementation:** medium tent 在已追踪像素使用单射线，
  另三个相位用 2 / 4 射线，局部随机噪声随相位变化。当前云体 32 帧、819,200 样本
  的历史全部通过，无 receiver / cloud-support 拒绝；大于 0.05 的透明度裁剪仅 104 个。
  根因不是 history gate。改用现有 3 × 3 邻域内的 1.5 full-pixel Gaussian，实际 source
  像素距离决定权重；排除轴向距离达到 3 像素的项，使半格位置的核对称。
- **MCR-002 / medium / verified / implementation:** 几何筛选仍先于光学融合，透明邻域
  不丢弃，当前 receiver 单独发布；全分辨率与非 phased 路径不变。常量、线性场相位
  居中、奇数尺寸末端、前景遮挡、support 消失以及此前 high 薄边行为均有 GPU 证据。
- **MCR-003 / low / accepted / project owner:** 2026-10-26 负责人要求提交当前结果。有限射线
  噪声不会完全消失；核会柔化数像素以下的云细节，不能把高频减少全部解释为画质提高。
  当前完整画面与移动观察保留云团大轮廓，没有观察到新的分层线或轮廓偏移。

## 自动化验证

`SceneGISCloudHighQualitySpec.js` 复用原 9 × 9 GPU fixture，新增半分辨率 5 × 5、
四相位的噪声 / 常量 / 线性场与遮挡用例。七项相关 strict-WebGL Specs 在两次有边界的
运行中通过：首次执行六项，噪声项未执行；针对该项单独执行成功（35.72 s），不将首次
运行描述为七项全通过。旧 tent 负控保留明显 checkerboard 方差，新核小于其 10%。
这是受控高频噪声用例，不用该比例预测所有实景降噪。

测试创建的 textures / framebuffers / shader 引用均释放；产品没有新增资源或 CPU 回读。
不重跑此前已记录存在陈旧负控与 strict-background 错误的巨型环境 fixture。

## 同输入实景对照

Windows / Chromium 155 / ANGLE D3D11 / RTX 3060 Ti，1001 × 826，Globe medium 积云，
coverage 0.3、density 1、base 750 m、thickness 4500 m、cloudTime 0，暂停时钟。
负责人当前近云视角，160 × 160 云体区域；同一帧原始 trace、场景深度、STBN，
两套独立 history 先运行 32 帧，再采集 32 帧，交替 old / new draw 顺序。

| 指标                                      | 原 tent     | 新核        |
| ----------------------------------------- | ----------- | ----------- |
| 亮度高频残差（四邻域 Laplacian 绝对均值） | 0.0100084   | 0.00499857  |
| 帧间亮度差绝对均值                        | 0.00243181  | 0.00148961  |
| 帧间透明度差绝对均值                      | 0.000417089 | 0.000267319 |
| Resolve GPU 中位数，32 对                 | 1.200 ms    | 1.214 ms    |

亮度采用 `L / (1 + L)`，高频约下降 50.1%，帧间亮度波动约下降 38.7%。
GPU 无 disjoint，GL error 0；不是整场景 FPS。trace 仍为四分之一像素，不增加射线
或纹理读取；kernel 复用原邻域。移动 24 帧时进入 `continuous-reprojected`，权重仍为
0.82，GL error 0，目视没有新的明显拖影。诊断 GPU 对象 / queries / wrapper 已回收，
临时测量和截图仅保存在 ignored `Build/`。

## 交付边界

无 SDK、公共配置、上游文件或 SGP 增量。此前启动优化的唯一 upstream-owned 修改
`packages/engine/Source/Renderer/ShaderProgram.js` 仍由 SGP-0069 登记；本次不扩大它。
按负责人要求纳入本地画质提交，不推送。`npm run build-release` 通过（15 s）；scoped ESLint / Spec Prettier、
全 AgentDocs Markdownlint、`git diff --check` 通过。全 AgentDocs Prettier 保留原有
594 个文件告警，本次新增 / 更新计划和评审已格式化，不扩大无关格式修改。

当前用户页已重新加载正式构建，确认运行中的 resolve 包含新核；恢复原相机、暂停日期、
medium、积云与 cloudTime 0，矢量覆盖保持原截图的关闭状态。ready、GL error 0，
控制台无 warning/error；最终画面保存在 ignored `Build/cloud-medium-after.png`。
