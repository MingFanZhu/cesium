# 平面地平线高度雾合成

- Type：standalone plan
- Status：implementation verified；负责人视觉验收待定
- Owner：当前任务，Architecture / execution
- Created / Updated：2026-10-20
- Parent：[extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Decisions：ADR-0045、ADR-0052
- Review：[技术自审](../reviews/2026-10-20-planar-horizon-fog-composition.md)
- Upstream / SGP：预期无新增修改

## 事实与范围

综合示例约 2213 m 高度、俯角 5°，地平线附近注记出现分段泛白。
关闭高度雾后消失；只保留吸收时天空变暗，而文字轮廓亮度异常。
Planar Background 提前叠加雾，Aerial 对 clear depth 不处理雾，
但对具有深度的注记实体再次处理。透明边缘与实体使用不同的合成路径。
Globe 已使用后置雾，Planar 尚未同步这一时序契约。

先建立实际 GPU 的背景、透明覆盖、有限深度最终合成回归，再统一 Planar
雾的最终合成时机。保持严格平面、原密度与亮度、SSE、深度协议、LUT，
不加俯角阈值或调色补偿。若仍有水平光源采样不连续，单独记录直接证据再处理。

## 实施与验证

1. 比较实际 Background 与 Aerial 对透明覆盖和实体的透射，旧代码必须失败。
2. 移除背景及星点的提前雾，将 clear / finite fog 汇入现有 Aerial；
   保留云阴影修正顺序，不新增 pass、目标纹理或采样循环。
3. 构建 Shader，运行新增回归及 Planar medium / Globe fog / lifecycle。
   旧像素 fixture 的未解决失败如有复现需单独说明，不删除或放宽。
4. 在原视角与连续倾角、高度变化下视觉检查，恢复用户相机和配置。
   记录帧提交耗时、资源变化及技术自审；更新 ADR 与索引。

## 第二项根因与修复

直接 GPU probe 的 `mu=-0.0001/0/+0.0001`、高度 2213 m、原始默认雾参数，
蓝色 fog source 为 `0.74659 / 0.77615 / 1.00868`。几何中点在水平线两侧
分别接近 1.1 km / 2.2 km / 31.1 km，照明取样并不代表近处主要贡献的介质。
新增连续性断言在仅修正合成时仍失败，蓝色向上偏差约 30%。

保留一次照明取样，把代表点改为 absorbed-transmittance 的中点，
使用既有解析积分的反解求距离；小光学深度和近水平使用数值 Taylor 展开，
不按相机俯角切换效果。GPU 额外覆盖薄雾、水平、常密度、向上/向下的
中点累计吸收量与光程边界。默认参数、积分范围、LUT、球面公式保持。

## 结果与交接

Development build、新增实际 GPU 回归、Planar final medium、Planar shadow-prefix、
Globe fog 与 Planar lifecycle 共 5 项 focused Specs 通过。生命周期测试的两次冷
编译超过默认 30 s，将该 fixture 单独设为 120 s，断言未放宽。
独立页面完成原视角及 160 帧连续升降/旋转，暂存截图于 ignored Build；
用户原页面的后续操作保留，不回写旧相机。

保持一次光源取样、原 LUT 与资源预算；同步 command/readback 中位耗时
由 4.1 ms 到 3.9 ms，仅作为未见明显回归的证据，不声称 GPU/FPS 提升。
范围内静态检查和未决历史项详见 review；按负责人要求形成本地提交，最终观感仍由负责人判断。
