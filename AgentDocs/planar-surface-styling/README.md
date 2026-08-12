# SceneGIS Planar Surface Styling

## Metadata

| Field                  | Value                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| Extension slug         | `planar-surface-styling`                                                   |
| Status                 | `active`                                                                   |
| Planning model         | `extension`                                                                |
| Active extension plan  | [总体计划](plans/2026-08-12-planar-surface-styling-extension.md)           |
| Current phase          | S2 Planar Imagery Color Filters                                            |
| Active phase plan      | [S2 phase plan](plans/2026-08-12-phase-s2-planar-imagery-color-filters.md) |
| Active standalone plan | None                                                                       |
| Architecture contact   | Architecture Agent                                                         |
| Execution contact      | Execution Agent                                                            |
| Last updated           | `2026-08-12`                                                               |

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
- ADR: S1=`ADR-0030`；S2 计划新增 `ADR-0031`
- SGP: S1=None；任何 upstream-owned diff 必须先更新 phase plan 并登记合法 SGP

## Current handoff

- Current state: S1 已由本地 checkpoint `04ac138b37295f328f3542f143b2f6b738a7e021` 关闭；Architecture 已依据当前源码确认 S2 phase plan，等待 Execution 正式实现。
- Next action: Execution Agent 按 [S2 phase plan](plans/2026-08-12-phase-s2-planar-imagery-color-filters.md) 实现并回交 review request；未 review/manual gate 前不得 checkpoint 或进入 S3。
- Current phase status: S1=`completed`；S2=`active`；S3-S4=`planned`。
- Open discussions: None；S2 已冻结 public filter contract、颜色处理顺序、normal-render snapshot 与 zero-upstream 边界。
- Latest review:
  [S1 shader source/delivery review](reviews/2026-08-12-s1-shader-source-foundation.md)为`approved`；无 actionable finding。
- Unresolved reviews: None。
- Known risks: S1 fragment inactive branch 升级风险由 ADR-0030 承载；S2 的 hue/gamma 颜色空间、完整 per-layer uniform 成本与 mutable `Color` snapshot 必须由 ADR-0031、real-Context pixels 和 warm identity 关闭。
