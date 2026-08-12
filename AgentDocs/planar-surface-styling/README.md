# SceneGIS Planar Surface Styling

## Metadata

| Field                  | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Extension slug         | `planar-surface-styling`                                             |
| Status                 | `active`                                                             |
| Planning model         | `extension`                                                          |
| Active extension plan  | [总体计划](plans/2026-08-12-planar-surface-styling-extension.md)     |
| Current phase          | S3 Terrain Height/Slope/Aspect/Contour Styling                       |
| Active phase plan      | [S3 phase plan](plans/2026-08-12-phase-s3-planar-terrain-styling.md) |
| Active standalone plan | None                                                                 |
| Architecture contact   | Architecture Agent                                                   |
| Execution contact      | Execution Agent                                                      |
| Last updated           | `2026-08-12`                                                         |

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
- ADR: S1=`ADR-0030`；S2=`ADR-0031`；S3=`ADR-0032`
- SGP: S1=None；任何 upstream-owned diff 必须先更新 phase plan 并登记合法 SGP

## Current handoff

- Current state: S3产品代码与Sandcastle development tooling follow-up均已通过Architecture review；`S3-R001`至
  `S3-R006`及`S3-T001`至`S3-T006`全部fixed，项目负责人manual visual gate已通过。
- Next action: Architecture创建S3独立本地checkpoint，再依据当前源码建立并派工S4 phase plan。
- Current phase status: S1=`completed`；S2=`completed`；S3=`completed`；S4=`planned`且尚未建立phase plan。
- Open discussions: None；S3 已确认复用 Cesium `Material`/Fabric source与uniform lifecycle，但由SceneGIS组装
  planar inputs，并冻结caller ownership、north-clockwise aspect、sampler budget与normal-render publication边界。
- Latest review:
  [S3 planar terrain styling](reviews/2026-08-12-s3-planar-terrain-styling.md)为`approved`；
  `S3-R001`至`S3-R006`及`S3-T001`至`S3-T006`全部fixed。
- Unresolved reviews: None。
- Known risks: S3使用Cesium `Material._uniforms` soft-private seam；eight-bit oct normal的flat量化需要style snap；
  Material samplers会压缩imagery texture-unit预算；Material identity切换必须兼顾上一normal replay与shader release。
