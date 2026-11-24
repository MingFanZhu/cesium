# 黄昏镜面环境光修复评审

- 类型：Architecture/code review
- 状态：approved
- 日期：2026-11-24
- 评审角色：架构与执行
- 关联：[修复计划](../plans/2026-11-24-twilight-sky-reflections.md)、[ADR-0085](../../../Documentation/SceneGIS/Decisions/ADR-0085-physical-sky-specular-ibl.md)、[ADR-0167](../../../Documentation/SceneGIS/Decisions/ADR-0167-globe-night-ambient-irradiance.md)
- 范围：SceneGIS 默认镜面天空探针，沿用 SGP-0015

## 发现与处置

- 镜面 IBL 过暗（中，已修复）：旧角度渐变在物理天空已变暗后才引入补光，
  并绕过 `nightAmbientIntensity`。捕获 Shader 复用天空亮度缺口函数，两世界分别验证
  日景 HDR、黄昏下限、既有深夜亮度、补光设置和缓存。负责人角色：执行。
- PBR Neutral 暗部色调（低，已记录）：固定曝光下，哑光预色调映射 RGB 下降或持平；
  PBR Neutral 的暗部偏移随色相变化，显示亮度仍可回升。本地试验页默认 AgX，
  并提供 PBR Neutral、Reinhard 对照。当前场景可按需选映射器，Cesium 默认映射器沿用原设置。

## GPU 验证

Chrome Headless 158，RTX 3060 Ti，ANGLE D3D11。固定相机、手动 HDR 曝光和光源，
用实际大气 LUT 读取天顶线性辐亮度。下表使用每个世界旧版的黄昏最低采样点。

| 世界 | 太阳高度 | 旧版黄昏 | 修复后黄昏 |    深夜 |
| ---- | -------: | -------: | ---------: | ------: |
| 平面 |   -4.55° |        0 |    0.01092 | 0.01092 |
| 球面 |   -5.82° |  0.00003 |    0.01092 | 0.01092 |

两世界的补光强度 0、1、2 分别测得 0、0.01092、0.02184。强度每次变化使共享探针
刷新一次，静态帧继续复用同一纹理。AgX 下左右方块在采样的黄昏至深夜段均未测得回亮。
PBR Neutral 的哑光显示读数在平面从 5.86 回升至 12.74，球面从 6.07 回升至 12.74。

交替执行旧、新探针刷新，共 16 对查询，每次 4 次提交。GPU 中位数平面约
0.226 → 0.217 ms，球面约 0.220 → 0.220 ms；P90 平面 0.285 → 0.319 ms，
球面 0.295 → 0.349 ms。静止帧沿用缓存。纹理、绘制次数和 GGX mip 边界保持一致。

开发版和发行版各 7 项严格 WebGL 镜面探针 Specs、2 项开发版黄昏漫反射 Specs 通过。
开发与发行构建均在试验页复核两个世界。发行构建、类型生成、TypeScript 检查和作用域内
ESLint 通过。本地试验页继续作为人工画面对照。
