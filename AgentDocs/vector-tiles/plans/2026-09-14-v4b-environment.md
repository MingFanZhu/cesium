# V4B：双世界矢量高级环境接入

- Type: `phase plan`
- Status: `completed`
- Author: 当前 Agent，architecture/execution 自审
- Architecture review: `confirmed`
- Updated: `2026-09-14`
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Predecessor: G1 checkpoint `a2f71e1120`，负责人确认接受
- ADR: [ADR-0071](../../../Documentation/SceneGIS/Decisions/ADR-0071-vector-environment-lighting.md)
- SGP: None planned

## Source facts and scope

负责人明确接受不实现 MapLibre hillshade，授权把高级环境接入矢量地图。现有环境 controller 在 World/
primitive update 前发布 Globe/Planar frame-local lighting record，既有物理 shader 已计算 Sun/Moon、sky
与 Beer transmittance；pre-tonemap HDR slot 已负责 atmospheric aerial/fog/cloud/rays/bloom 合成。
当前矢量 background/fill/line 只计算常量 ambient + Lambert，覆盖地表颜色后无法继承其光照与阴影。

本阶段只为自有地表矢量增加这些现有资源的 receiver，不修改 MVT、Worker、tile cover 或源样式。
同时覆盖 Planar 无 terrain 的 flat、真实 terrain ground、Globe 椭球与真实 terrain。点圆/文字/图标
保持制图颜色，并参与既有场景颜色/深度合成；不把 billboard 法线当成真实地表材质。

## Implementation

1. 独立 Scene helper 借用匹配 World 的当前 lighting record；Renderer helper 惰性生成环境 Shader
   variants，复用 base geometry/VA/纹理/pick，销毁时只释放自己增加的 program 引用。
2. 复用现有物理源 GLSL；使用真实 surface eye position 与 geometric normal，分别处理 planar absolute
   Z 和 Globe ECEF，direct 与 sky 分开，只对 direct 应用阴影。不修改光源/controller 所有权。
3. Globe 定向几何阴影借用当前 Scene ShadowMap，用真实地表位置而非覆盖凸体接收；继续遵循
   scene.shadowMap.enabled 与 Globe ShadowMode。复用 native cascade/visibility builtins，覆盖凸体不 cast。
   Planar 维持已有不支持 native geometry-shadow 的资格边界，保留高级云影。
4. 扩展 Test 公开/Globe 页面，提供高级环境开关与已有云/雾/时刻的必要验收控件。使用单个
   caller-owned controller/host，切换和页面销毁完整释放；地图和环境分别报告就绪/错误。
5. Specs 验证真实像素、source/sky/cloud/geometry-shadow、alpha/pick、切换与共享资源生命周期。
   页面 E2E 使用本地 MVT 与实际环境资产验证双世界组合；真实公共数据做视觉与 bounded timing。

## Validation and gate

169 项既有 vector 回归，新增环境 receiver WebGL Specs 与两种 World 页面组合；复核必要的既有环境
receiver 回归。执行 engine/root/release、types/tsc、真实安装包入口，按风险验证 GPU 与生命周期。
记录性能代价，不增加自动画质降档。负责人视觉验收之前保持 active；现已确认通过，不激活下一 phase。
不新增地图颜色 RTT、ShadowMap、环境 LUT/atlas、后处理或独立阴影开关。

## Current handoff

负责人继续要求补充环境参数与原生时间轴，本轮作为 V4B 验收页面补充推进：
只在 Test 组装既有 environment 属性和 Viewer timeline/animation，不扩展产品 API/Shader。
参数按光照、云、雾/泛光分组，修改即时生效，关闭重开保留；支持恢复默认参数。
Viewer clock 独立于环境开关，Globe 沿用 native astronomy，Planar 使用既有 astronomical mode，
以所选定位点显式设置经纬度。时间轴拖动/播放驱动光照与云时间，不被环境重新启用覆盖。
复用双世界本地 E2E，验证参数传递、原生时间轴/播放、光向更新及关闭/重开保留设置；
本轮仅页面组合修改，不重复 engine/release 全量验证。扩展后的 2 项 E2E 通过（Globe 2.9 min、
Planar 2.7 min），覆盖实际参数、时间轴点击、原生播放/暂停、光向/云时间变化、参数与时间保留、
恢复默认以及环境往返释放。页面范围 ESLint/Prettier、全部 AgentDocs Markdownlint 通过。

实现与技术验证完成，见 [V4B review](../reviews/2026-09-14-v4b-environment-review.md)。173 项 vector Specs、
两种 World 实际环境 E2E、两项既有地形页面回归、build/types/release/实际安装包通过。
唯一扩展影响为修正已复现的 Planar surface 休眠 HDR derived-command 切换问题，仍在 SceneGIS-owned 区域。
高级环境 controller 的资产/品质/能力约束原样保留；未资格透明 Globe、地下相机、source LOD 接缝和完整曲面字形。
同视角 medium 的 CPU 提交 P50 增量约 0.9 ms，帧间隔 P50 17.4→24.0 ms，详细条件见 review。
负责人于 2026-09-14 明确“我已手动检查通过”，视觉 gate 关闭；本阶段代码、Specs、ADR 与记录
形成独立 V4B 本地 checkpoint，不激活后继阶段。近地平线性能问题继续由 M1 承接，详见 V4B-R06。
