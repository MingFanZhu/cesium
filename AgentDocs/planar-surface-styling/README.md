# SceneGIS Planar Surface Styling

## Metadata

| Field                  | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Extension slug         | `planar-surface-styling`                                         |
| Status                 | `completed`                                                      |
| Planning model         | `extension`                                                      |
| Active extension plan  | [总体计划](plans/2026-08-12-planar-surface-styling-extension.md) |
| Current phase          | None（S1-S4 completed）                                          |
| Active phase plan      | None                                                             |
| Active standalone plan | None                                                             |
| Architecture contact   | Architecture Agent                                               |
| Execution contact      | Execution Agent                                                  |
| Last updated           | `2026-08-13`                                                     |

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

- Current state: S4最小联合Widget资格、installed delivery、两个现有示例中文tool panel与文档收口已实现；Architecture
  focused re-review已批准代码、release evidence与Sandcastle launcher，S4-R001至S4-R003及S4-T007全部fixed。端口释放后，
  同一Playwright config/project/spec的headed dev与release E2E均通过；项目负责人已使用修复后的launcher完成final visual/manual
  gate并授权进入下一扩展。默认headless `--use-angle=gl`在当前NVIDIA环境的Context初始化失败保留为工具链风险。
- Next action: 本扩展关闭；后继能力进入独立`planar-environment`扩展，不在本目录追加S5。
- Current phase status: S1=`completed`；S2=`completed`；S3=`completed`；S4=`completed`。
- Open discussions: None；S3 已确认复用 Cesium `Material`/Fabric source与uniform lifecycle，但由SceneGIS组装
  planar inputs，并冻结caller ownership、north-clockwise aspect、sampler budget与normal-render publication边界。
- Latest review:
  [S4 unified qualification and delivery](reviews/2026-08-12-s4-unified-qualification-delivery.md)为`approved`；headed dev/release
  E2E、launcher follow-up与项目负责人final manual gate均已通过。
- Unresolved reviews: None。
- Known risks: S3使用Cesium `Material._uniforms` soft-private seam；默认headless OpenGL ANGLE在当前NVIDIA环境不能初始化
  完整Viewer；中文长文本需要保持compact overlay/credit-safe布局。
- Tooling follow-up: manual gate live run暴露build-watch marker/output瞬时竞态与external Cesium dev routes返回HTML；
  Execution已在SceneGIS-owned launcher/wrapper内修复，未触碰upstream或产品代码。
