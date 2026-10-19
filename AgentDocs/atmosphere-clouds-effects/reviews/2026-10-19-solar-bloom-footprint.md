# 双世界太阳泛光形状修复评审

- Type: architecture / code review
- Status: implementation verified；负责人视觉判断保留
- Owner: 当前任务，Architecture / execution self-review；未启用独立 Agent
- Created: 2026-10-19；Updated: 2026-10-20
- Target: [standalone plan](../plans/2026-10-19-solar-bloom-footprint.md)
- ADR: [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)
- Upstream-owned files / SGP delta: none

## 发现与处置

- **P1 / fixed：球面有限模糊仍有轴向方形支撑。** 当前相机、时刻、HDR / PBR Neutral、exposure 1
  下复现圆角方形，关闭 bloom 后太阳本体圆形。旧算法三个半径只沿水平与垂直方向重复扩散；
  改为两世界共用既有 Planar 六方向调度，保持归一化核、相同二阶矩、六次 blur 和全部 GPU 资源。
  不修改太阳辐射、阈值、Shader、颜色合成或镜头遮挡。
- **P2 / fixed：原回归不足以检查形状。** 原 32×16 fixture 小于完整泛光范围；新增 256×256
  真实 GPU 亮圆盘，在 24 个方向测量 0.1 / 1.0 两个可见等亮轮廓，限制半径极差小于均值的 6%。
  旧 Globe 的极差为 12.27% / 7.07%，两项失败；Planar 通过。修复后两世界均通过，
  测试显式使用原强度 0.05，不能靠降低默认值绕过回归；恒定场线性增益和 alpha 也保持。
- **P2 / fixed：太阳泛光默认过强。** 当前太阳输入 RGB 约为 (42368, 15872, 3320)，
  放大了有限支撑与显示饱和的可见性。负责人明确要求降低默认强度，现为 0.005，原值 0.05 仍可显式设置。
  修改构造器、JSDoc、默认值断言和交付检查预期；综合示例步进为 0.001，准确显示新默认。
  这是全场景艺术默认，不是太阳能量校正，也不改变独立的 lensFlareIntensity。

## 验证

- 新圆盘 GPU 回归 2/2：旧 Globe 失败，修复后两世界通过；不增加生产测试分支。
- 原 HDR bloom / Sun-gated lens GPU 回归 2/2：亮度阈值、线性加法、alpha、有限深度遮挡和调暗输入。
- 原 Planar HDR 生命周期 1/1：warm 切换、零工作旁路、resize 与释放；默认值契约 1/1。
  共 6 项相关 Specs 通过，启用 strict WebGL validation。未运行完整环境 suite，历史背景 fixture 问题未宣称修复。
- 当前 Globe 同视角在原强度 0.05 下已为圆形；新默认 0.005 下泛光减弱。
  Planar HDR 新默认也验证了圆形光斑；Globe LDR 仍遵守既有 clamp 显示，亮部可饱和，未新增 tone mapping。
  页面环境 ready、错误为空，原相机、时刻、影像与 HDR 配置恢复，保留新强度；临时 Planar 页已关闭。
- 开发 / 发布构建、build-ts / tsc、scoped ESLint 与格式检查通过。交付检查脚本仅同步默认值预期，未运行全量安装矩阵。
  本次只改变 SceneGIS-owned 文件，无 upstream-owned file / SGP 增量，不提交生成物。
- AgentDocs 全量 Markdownlint 通过；全量 Prettier 检查仍报告 452 个既有格式问题文件，未格式化无关文档。

同一实际输入、1001×826、RTX 3060 Ti / ANGLE D3D11，对旧 / 新 threshold + 六次 blur
交替各测 24 次；GPU 中位数为 0.055296 / 0.056320 ms，差约 0.001024 ms。
无 disjoint，GL error 为 0。测量期间存在其他 GPU 测试，新序列有 1.8～1.9 ms 离群样本，
该证据只说明有限场景的典型成本，不保证帧延迟或其他 GPU 性能。program / command / texture / FBO
数量及 texture fetch 数均不变；临时 query 已释放。原始证据放在忽略的 `Build/bloom-fix/`。

## 剩余边界

六方向离散有限核是近似圆对称，不承诺连续光学 PSF；新的等亮轮廓测试约束本次已复现失真。
亮度效果仍受曝光、tone mapping、太阳高度和输入动态范围影响，LDR 可继续饱和。
本次未扩展光学模型或自动曝光，也未处理此前记录的环境背景 strict-WebGL fixture 问题。
技术自审未发现新的实现阻塞，最终外观由负责人判断。2026-10-20 按负责人要求将本次修复与验证记录纳入独立本地提交，未推送；既有边界保持记录。
