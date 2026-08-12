# SceneGIS Planar Surface Styling

## Metadata

| Field                  | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Extension slug         | `planar-surface-styling`                                         |
| Status                 | `active`                                                         |
| Planning model         | `extension`                                                      |
| Active extension plan  | [总体计划](plans/2026-08-12-planar-surface-styling-extension.md) |
| Current phase          | None; S1 completed                                               |
| Active phase plan      | None                                                             |
| Active standalone plan | None                                                             |
| Architecture contact   | Architecture Agent                                               |
| Execution contact      | Execution Agent                                                  |
| Last updated           | `2026-08-12`                                                     |

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
- ADR: S1 已新增 `ADR-0030`；后续公共 styling contract 在相应 phase 激活时编号
- SGP: S1=None；任何 upstream-owned diff 必须先更新 phase plan 并登记合法 SGP

## Current handoff

- Current state: S1 implementation、自动化验证与 Architecture review 已完成并 approved；等待本地 checkpoint commit。
- Next action: Architecture Agent 创建 S1 中文本地 checkpoint；checkpoint 完成后再依据当前源码细化 S2，禁止提前实现。
- Current phase status: S1=`completed`；S2-S4=`planned`，尚未激活。
- Open discussions: None；S1 的目录与构建选择已收敛，长期决定由 ADR-0030 承载。
- Latest review:
  [S1 shader source/delivery review](reviews/2026-08-12-s1-shader-source-foundation.md)为`approved`；无 actionable finding。
- Unresolved reviews: None。
- Known risks: fragment template 的inactive lighting branch由GLSL preprocessor裁剪；focused source tests已改为验证
  variant defines，实际compile/pixel由Surface与A7 real-Context qualification覆盖。后续Cesium升级仍需复核
  converter/minifier、生成模块ignore与tarball files。
