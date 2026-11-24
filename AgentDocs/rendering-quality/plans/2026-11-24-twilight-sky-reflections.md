# 黄昏镜面环境光过暗修复

- 类型：standalone plan
- 状态：completed
- 日期：2026-11-24
- 架构与执行：当前任务
- 父计划：[Rendering quality](2026-09-18-rendering-quality-extension.md)，关联 [R3](2026-09-19-r3-sky-reflections.md)
- 基线：`scenegis/develop@ecf8f25414`
- 关联：[ADR-0085](../../../Documentation/SceneGIS/Decisions/ADR-0085-physical-sky-specular-ibl.md)、[ADR-0167](../../../Documentation/SceneGIS/Decisions/ADR-0167-globe-night-ambient-irradiance.md)、[评审](../reviews/2026-11-24-twilight-sky-reflections.md)
- 上游集成沿用 SGP-0015

## 实际复现

在本地试验页固定相机和手动 HDR 曝光，并隔离太阳/月亮直接光。两个实际世界均使用发布 LUT。
平面天顶镜面探针在太阳高度 -1.27° 到 -4.55° 为 0，随后升至约 0.01092 线性亮度。
球面探针在 -5.82° 降至约 0.00003，随后达到同一深夜值。调节 `nightAmbientIntensity` 对旧探针无效。
捕获 Shader 仍按太阳高度叠加旧夜间项。

哑光方块的预色调映射 RGB 从黄昏到深夜逐通道下降或持平。PBR Neutral 把随 RGB 最小值变化的偏移
从三个通道一起扣除，放大了暮色变蓝时的表观亮度回升。相同 HDR 输入下，AgX 和 Reinhard 对照平稳。
引擎修复范围是已证实的间接光源缺口。试验页提供三种显示曲线的对照，以复核照明和显示的影响。

## 设计与验证

1. 镜面天空捕获复用 ADR-0167 的平滑缺口函数，按天空辐亮度和统一夜间下限比较。
   对均匀半球使用 `E = πL` 换算。球面地面分支在反照率和传输之前补足地面天空辐照度。
2. 补光强度纳入现有探针缓存键。参数变化使共享探针完整更新一次，复用 cubemap、FBO、GGX 各 mip。
3. 在原试验页重测两世界的 HDR 探针和材质像素，覆盖日景、黄昏、深夜及补光强度 0、1、2。
   补齐现有镜面 IBL Specs 的黄昏连续性、深夜不变、同帧配置刷新与资源复用证据。
4. 通过严格 WebGL 定向回归、构建、类型和差异检查，更新 ADR 与交接。

## 实施结果

球面和平面探针平滑达到相同的深夜下限。两世界的夜间强度 0、1、2 对应天顶辐亮度
约 0、0.01092、0.02184，强度变化各刷新一次探针。
开发版与发行版各 7 项镜面 IBL Specs、2 项开发版黄昏漫反射 Specs、
发行构建及类型检查通过。试验页按负责人要求留在本地。GPU 对照和显示限制见评审。
