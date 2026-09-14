# G3：平面地表透明

- Type: `phase plan`
- Status: `completed`
- Owner: 当前 Agent，architecture/execution 自审
- Architecture review: `confirmed`
- Updated: `2026-09-14`
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Predecessor: G2 checkpoint `9e33cbd279`
- ADR: [ADR-0073](../../../Documentation/SceneGIS/Decisions/ADR-0073-planar-surface-opacity.md)
- SGP: None；计划仅修改 SceneGIS-owned 文件

## Contract and source facts

负责人要求平面也支持矢量、地表、影像分别透明。G2 已提供共享 Layer.opacity，Planar imagery alpha 已存在。
World.baseColor 当前强制 opaque；Surface 在 Pass.GLOBE 写颜色与深度，随后原生复制 globeDepth 支持直接贴地。
Scene 的每个 frustum 保持 GLOBE 命令提交顺序。地形有遮挡和裙边，只启用 blending 会重复合成隐藏山坡。

## Implementation

1. 增加 World.opacity，有限 0..1，默认 1，正常 render 发布；baseColor 保持 opaque。
2. opacity < 1 时通过已有 World.renderEnvironment 在 surface 开始前保存背景快照，片元合成背景与地表最终颜色，
   保持原深度测试及颜色覆盖。opacity = 0 写回背景，所有模式仍单次绘制；矢量在原 classification 时段直接绘制。
3. owned 背景 FBO/texture 按尺寸与 HDR 格式复用、销毁；透明 Shader variant 首次创建后缓存，额外占一个 sampler。
   复用原命令、VA、原生 log-depth 与深度复制，不新增 Pass、Worker 或地图颜色 RTT。WebGL 2 为透明模式契约。
4. 平面综合页补充地表与本地网格影像 alpha 控件，不增加高级环境；中文上手页保持简单。
5. 资格限从地表上方观察当前可见地表。仍保留几何深度遮挡，地下、背面和高级环境透明合成另行资格。

## Validation and gate

- API 值域与默认；平面、山峰遮挡、影像 alpha、透明地表直接矢量与 pick、log/linear depth 的 WebGL pixels。
- 正常/pick 快照、命令与 GPU 资源复用和销毁；默认不透明回归。
- 本地真实地形页面 E2E、控件、标注和有界 CPU 测量，实际页面视觉检查。
- 公共 API 完整 build/types/release 与实际包验证；修改范围 lint、patch audit。
- 技术自审后交负责人视觉验收，再形成独立 checkpoint。

## Confirmed implementation adjustment

初始每视锥深度预绘制仍会把不同视锥中的隐藏山坡颜色混入近景，多视锥 Spec 复现 128→192。
按 ADR-0073 改为背景快照后，linear/log 山地像素、原生深度和资源测试通过；不放宽当前可见表面范围。

## Current handoff

实现与[技术自审](../reviews/2026-09-14-g3-planar-transparency-review.md)通过：255 项相关 Specs、6 项平面 E2E、
完整 build/types/release 与三种实际包入口通过。平面页新增地表、测试影像滑块，保留共享 vector opacity。
当前原生浏览器已打开平面验收页并检查真实地形；无 upstream-owned 修改，无新增 SGP。
负责人确认后要求在上手示例加入 lil-gui 矢量透明度控件，按推进授权关闭 G3 gate，先形成独立 checkpoint。
地下/背面及高级环境透明合成仍保留后继资格。
