# SceneGIS Planar Surface Styling

## Metadata

| Field                  | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Extension slug         | `planar-surface-styling`                                         |
| Status                 | `active`                                                         |
| Planning model         | `extension`                                                      |
| Active extension plan  | [总体计划](plans/2026-08-12-planar-surface-styling-extension.md) |
| Current phase          | None（S2 completed；S3 尚未激活）                                |
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
- ADR: S1=`ADR-0030`；S2 计划新增 `ADR-0031`
- SGP: S1=None；任何 upstream-owned diff 必须先更新 phase plan 并登记合法 SGP

## Current handoff

- Current state: S2 implementation、自动化验证、Architecture review与项目负责人manual gate均已完成；
  `S2-R001`至`S2-R004`全部关闭。本索引与相关计划、review随S2本地checkpoint提交，未push、未进入S3。
- Next action: S2 checkpoint后，由Architecture依据当前源码重新发现并细化S3 terrain
  height/slope/aspect/contour styling phase；在正式assignment前Execution不得进入S3。
- Current phase status: S1=`completed`；S2=`completed`；S3-S4=`planned`且均未激活。
- Open discussions: None；S2 已冻结 public filter contract、颜色处理顺序、normal-render snapshot 与 zero-upstream 边界。
- Latest review:
  [S2 planar imagery color filters](reviews/2026-08-12-s2-planar-imagery-color-filters.md)为`approved`；
  `S2-R001`至`S2-R004`全部fixed，manual gate通过。
- Unresolved reviews: None。
- Known risks: full uniform shape在当前real Context/dev/release通过，但Cesium升级后仍需复核fragment uniform limit与
  builtin dependency scan；hue/saturation只承诺当前Cesium builtin数学，不宣称与Globe HDR color space相同。
