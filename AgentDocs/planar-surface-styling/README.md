# SceneGIS Planar Surface Styling

## Metadata

| Field                  | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| Extension slug         | `planar-surface-styling`                                               |
| Status                 | `active`                                                               |
| Planning model         | `extension`                                                            |
| Active extension plan  | [总体计划](plans/2026-08-12-planar-surface-styling-extension.md)       |
| Current phase          | S1 Shader source and delivery foundation                               |
| Active phase plan      | [S1 phase plan](plans/2026-08-12-phase-s1-shader-source-foundation.md) |
| Active standalone plan | None                                                                   |
| Architecture contact   | Architecture Agent                                                     |
| Execution contact      | Execution Agent                                                        |
| Last updated           | `2026-08-12`                                                           |

## Scope

### In scope

- 为 SceneGIS 自有平面 Surface 与 Ground shader 建立可升级、可发布的独立 GLSL 源码目录。
- 为 `SceneGISPlanarImageryLayer` 增加坐标系无关、uniform-only 的颜色滤镜。
- 为平面地形建立 height、slope、aspect 和 contour styling，并优先复用 Cesium `Material` 体系中可证明不依赖椭球的部分。
- 保持现有 single opaque surface command、bottom-to-top imagery composition、terrain lighting、pick/depth replay 与资源生命周期。

### Out of scope

- 太阳、月亮、天文参考点、昼夜 alpha、大气和 SkyBox 适配；这些属于独立的 `planar-environment` 候选扩展。
- `splitDirection`、`cutoutRectangle`、纹理 minification/magnification 配置，以及 CRS 推断或重投影。
- 复制 Cesium Globe shader、把 planar world 伪装为 `Globe`，或修改 Globe 的 ellipsoid-oriented material runtime。
- 在没有当前 phase 源码证据时提前冻结后续 terrain material 公共 API 或动态 shader 生成实现。

## Engineering links

- Source paths: `packages/engine/Source/Shaders/SceneGIS/**`、
  `packages/engine/Source/SceneGIS/Scene/**`
- Test paths: `packages/engine/Specs/SceneGIS/Scene/**`
- Sandcastle: 预期复用 `scenegis-planar-imagery` 与 `scenegis-planar-terrain`；统一资格阶段再决定是否新增案例
- Branch: `feature/planar-surface-styling`
- Base commit: `2086e5e42038dfdde23220dea8a33395445e6cd8`
- Parent extensions: completed `planar-world`、`planar-terrain`、`planar-terrain-advanced`
- ADR: S1 计划新增 `ADR-0030`；后续公共 styling contract 在相应 phase 激活时编号
- SGP: S1 预计 None；任何 upstream-owned diff 必须先更新 phase plan 并登记合法 SGP

## Current handoff

- Current state: extension plan 与 S1 phase plan 已由 Architecture confirmed；产品实现尚未开始。
- Next action: Execution Agent 按 S1 assignment 建立 Shader source/delivery foundation，回写验证与 review request。
- Current phase status: S1=`active`；S2-S4=`planned`。
- Open discussions: None；S1 的目录与构建选择已收敛，长期决定由 ADR-0030 承载。
- Unresolved reviews: None；S1 ready-for-review 后创建 review 文档。
- Known risks: 当前 shader 转换器只扫描 `Source/Shaders/**`，生成 `.js` 被忽略但 npm 包包含 `Source`；动态 Surface fragment 仍需由 JS 组合 variant，迁移不得改变 cache key、uniform 或像素行为。
