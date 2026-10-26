# 球面地表裁剪近景精度 Review

- Type: implementation / architecture self-review
- Status: completed; automated gates passed; project owner approved submission
- Author / owner: current implementation agent
- Date: 2026-10-26
- Target: SGP-0070, [ADR-0191](../../../Documentation/SceneGIS/Decisions/ADR-0191-globe-clipping-precision.md)
- Plan: [near-field precision](../plans/2026-10-26-near-field-precision.md)

## Findings

- P1 / fixed：绝对角度 Float32 打包和 SDF 重建产生米级量化。改成区域归一化坐标；
  原生 packing Spec 解码新协议后保留原有球面断言，新增近景 GPU regression 约束实际结果。
- P1 / fixed：GlobeVS 的 ECEF 合成/球面计算丢失低位，且角度插值依赖地形 LOD。
  改为 RTC varying 和高低位片元投影，两个视角、实际不同 tile LOD 与 ENU 直壁对照通过。
- P1 / fixed：ANGLE 折叠补偿算式会让厘米误差经 skirts 显成细长台阶。
  固定 uniform 舍入屏障阻止重结合；GPU 投影数值回归小于 1 mm，开启裙边的贴合回归通过。
- P2 / accepted：补偿片元投影增加运算量。当前本地场景 GPU 对照没有明显回退；不承诺所有
  GPU、分辨率和大区域数量的成本相同。后续出现代表性性能问题时按实测单独优化。

## 验证

- `SceneGISGlobeClipping`：4/4，真实 WebGL shader validation；覆盖近景墙面、移动与 LOD、
  凹环、多区、inverse、约 20 m 的非平坦地形、高低位和纹理复用/销毁。
- `ClippingPolygon`：54/54；`SceneGISPlanarModelClipping`：7/7。
- `gulp buildRelease`、`npm run tsc`、作用域 ESLint 通过。
- 上游补丁审计通过：当前交付 7 个 upstream-owned 文件，生成文件状态为 0。
  全量 AgentDocs markdownlint 通过；全量 Prettier 仍报告其他 595 个既有文件，
  本次扩展全部 Markdown、ADR、示例与 Spec 的作用域 Prettier 检查通过。
- `Test/球面地表裁剪.html`：用户给出的原点/矩形/相机，绿色原生地表、红色直壁、蓝色坑底；
  默认质量 1，skirt 开启。保留 plane、skirt、quality、SSE 对照控件。
- GPU：Windows / Chrome 155 / ANGLE D3D11 / RTX 3060 Ti，889×667，32 帧。
  相同已上传距离场，只切换原生/修复版 Globe VS/FS，计时包含整个场景。
  原生 median / P95 为 4.29 / 6.07 ms，修复版为 4.22 / 5.71 ms；这不是加速结论，
  小差异视为采样波动。对照结束恢复修复版并释放临时 shader。

## 上游修改清单

均登记 SGP-0070：

- `packages/engine/Source/Scene/ClippingPolygonCollection.js`
- `packages/engine/Source/Scene/GlobeSurfaceShaderSet.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`
- `packages/engine/Source/Shaders/GlobeVS.glsl`
- `packages/engine/Source/Shaders/GlobeFS.glsl`
- `packages/engine/Source/Shaders/PolygonSignedDistanceFS.glsl`
- `packages/engine/Specs/Scene/ClippingPolygonCollectionSpec.js`

## 剩余风险与交接

本轮没有 SDK 改动，没有改变地形网格、关闭裙边或增加墙宽。Model 的世界坐标近景精度
不是本次范围；它继续使用原生投影并共享更精确的 SDF。原生日期变更线/极点语义不扩展。
其他 GPU backend、超大范围/多区域数量的性能尚未实测。项目负责人于 2026-10-26 确认提交本次修复。
