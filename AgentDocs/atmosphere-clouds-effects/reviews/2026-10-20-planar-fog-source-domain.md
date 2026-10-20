# 平面中午高度雾亮度域评审

- Type: architecture / code review
- Status: implementation verified；负责人视觉判断保留
- Author / Owner: 当前任务，Architecture / execution self-review；未启用独立 Agent
- Created / Updated: 2026-10-20
- Target: [standalone plan](../plans/2026-10-20-planar-fog-source-domain.md)
- ADR: ADR-0044 / ADR-0045 的 2026-10-20 修订
- Upstream-owned files / SGP delta: none

## 发现与处置

- **P1 / fixed：Planar 高度雾与天空的亮度域不一致。** 同一南京经纬度、706.353 米高度、
  ENU 方向、60° FOV、北京时间中午、手动曝光 1、PBR Neutral 和默认雾参数下，
  Planar 开雾出现暗蓝地平线带。天空 source 乘以 `backgroundRadianceScale`（默认 2.5），
  fog source 却使用 1，浓雾将远景混向较暗颜色。统一 Background、finite Aerial、cloud fog
  和 clear-depth shadowed / unshadowed affine difference 的倍率，保留各路径合成所有权。
- **P2 / fixed：Planar 定向雾二次光谱归一化。** 输入已经是 scene RGB，Planar 仍除以
  `max(SOLAR_IRRADIANCE)`，约 1.912；Globe 已不执行。移除该遗留分支，保持 Sun / Moon
  primary-light 选择、透射、阴影和现有白平衡语义。
- **P2 / fixed：回归未覆盖 fog source 倍率。** 扩充既有 immutable-HDR GPU fixture，
  用黑色地物 / 云输入隔离 source energy，检查有限深度和云前雾、真实 Background 的
  1 → 2.5 线性增益与 alpha；直接运行产品 GLSL 检查 scene RGB directional source。
  旧产品代码确实失败，修正后通过；同步更新 Globe 旧归一化 mutation 的匹配位置。

## 验证

本地原始证据位于忽略目录 `Build/planar-noon-fog/`，不提交生成物或临时诊断脚本。

- `npm run build` 后运行 strict WebGL / ChromeHeadless：
  `qualifies the Planar final medium composition` 新增断言通过。
  最初直接执行 `npm run test` 仅重打 bundle，没有重新生成 GLSL 模块，仍加载旧代码；
  已纠正验证入口，未把该次失败作为修复后的有效结果。
- 相关 4 项 strict GPU / lifecycle 测试通过：Planar P10 shadow prefixes、Globe full
  clear-depth fog、Planar P11 Moon lighting，以及 all height-fog controls as warm uniforms。
  共 5 项通过，不宣称完整环境 suite 通过。
- 两世界统一中午、相机、手动曝光和雾参数，用相同 Bright 矢量底图对照；
  `planar-before.png` / `planar-after.png` 保留同一平面相机，暗蓝地平线带消退。
  另存 `globe-reference.png` 和平面 fog-off、近地、60 km、大俯角、向上视角。
- Planar 按 postRender 连续改变高度 20～60000 米、俯角 -1.2～+0.15 rad，共 120 帧。
  无 render error，全部已有环境资源 identity 保持；雾密度 0.000008、falloff 0.0002 未变。
  高空外部矢量请求出现一次 404，与环境 render error 分开记录，不纳入环境修复。
- RTX 3060 Ti / ANGLE D3D11、1001×826，实际 Aerial 输入和 LUT 固定，旧 / 新 Shader
  交替各测 24 次：median 均为 0.08192 ms，P90 为 0.083968 / 0.082944 ms。
  无 disjoint，GL error 0，原资源 identity 保持；临时 programs、FBO、texture、queries 已释放。
  不增加 pass、lookup、循环或持久资源；此结果只代表该场景 Aerial，不代表整帧或其他 GPU。
- 开发 / 发布构建、build-ts / tsc、scoped ESLint / Prettier 通过。类型生成保留既有上游
  JSDoc 警告，命令正常退出；AgentDocs 全量 Markdownlint 通过，全量 Prettier 仍报告
  452 个未修改文档的既有格式问题，本次修改文件均通过，没有扩大格式化范围。
- `git diff --check` 通过。改动逐路径对照官方基线
  `6d5d8b1f0725b6f831b336463f4b11c98023427b`，无 upstream-owned file，无 SGP 增量，
  工作区不包含待提交生成物。最终两页环境 ready，当前矢量加载完成，错误显示为空。

## 边界与交接

保留 Planar fixed-Z slab、独立 LUT 和解析积分；Globe 球壳几何不变。几何及远处光程不同，
两种世界不应逐像素相同。雾光照仍使用既有代表点和经验 ambient tint；本次未升级散射模型。
没有增加俯角阈值，也没有调密度、最大不透明度或曝光来掩盖色差。

技术自审没有发现新的实现阻塞。既有 strict background fixture 问题继续保留在
[历史评审](2026-10-15-planar-high-altitude-precision.md)，不因本次相关测试通过而关闭。
验证时两页保留中午同向相机、雾开启和手动曝光，供负责人继续视觉判断。
2026-10-20 按负责人后续要求独立提交，未推送；此前自动曝光示例另行提交。

## 关雾后的大气差异跟进

负责人继续指出关雾后 Planar 地平线浅粉色过渡与 Globe 不同。保持两页原中午相机、
手动曝光与高度雾关闭；额外离屏 GPU probe 强制相同 ENU Sun、706.353 米高度和 8 个
观察仰角，隔离 UI / 地物 / 后处理。没有继续修改产品代码或做颜色补偿。

- 水平射线的 Planar RGB transmittance 为 0，Globe 为约 `[0.1517, 0.01639, 0.0001434]`。
  这是无限 flat slab 与球壳光程的明确区别；固定高度的水平射线不会退出平面浓密层。
  仰角 1° 时 Planar 红色散射高约 34%，到 30° 三通道差异约 1.5%～2.1%。
- 用 generator 的完整 32×32 multiple source grid，在相同方向直接积分，与当前 GPU
  LUT 输出比较，8 条射线各通道相差 0.25%～1.22%。该对照验证 LUT 采样与现有积分一致，
  **不等于独立证明其多次散射近似足够准确**。相关单次散射 dense integral 和水平双侧
  极限 Node 回归 2/2 通过；临时 GPU 资源已释放，GL error 为 0。
- Planar 高阶 source 仍为方向平均近似，Globe 保留方向性散射。几何已解释主要近水平差异，
  但不据此声称所有外观差异均为不可避免。后续若继续提高物理质量，应由环境维护负责人
  评估方向性多次散射及独立参考误差，沿用 ADR-0042 的 fixed-Z 约束，不直接套球面 LUT。

证据保存在同一忽略目录的 `sky-probe.json` / `sky-reference.json`。
此跟进是诊断结论，不代表本次高度雾修复已获负责人视觉验收，也不激活新实现阶段。
