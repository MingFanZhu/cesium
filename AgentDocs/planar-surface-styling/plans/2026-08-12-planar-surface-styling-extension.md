# 总体计划：SceneGIS 平面 Surface Styling

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Parent extensions: completed `planar-world`、`planar-terrain`、`planar-terrain-advanced`
- Related discussions: 项目负责人提出 Shader 独立目录、平面影像滤镜及 terrain 坡度/坡向/等高线能力
- Related reviews: None
- ADR: S1=`ADR-0030`；S2 计划新增 `ADR-0031`；后续 phase 按激活时源码事实决定
- SGP: S1=None；S2 预计 None

## Objective

在保持真正平面 Cartesian3、single-command Surface、terrain/imagery ownership 与既有导航/光照契约的前提下，建立 SceneGIS 自有 GLSL 的长期构建基础，为平面影像增加常用颜色滤镜，并为米制 Z-up terrain 增加 height、slope、aspect 与 contour styling。扩展采用 progressive elaboration，未来 phase 不提前冻结易变 shader 组合、Material 接口或构建细节。

## Non-goals

- 不在本扩展实现太阳、月亮、天文定位、大气、SkyBox 或 day/night alpha。
- 不支持 `splitDirection`、`cutoutRectangle`、texture sampler filter 或自动 CRS/地理位置推断。
- 不复制 Cesium Globe shader，不让 planar world 继承或伪装 `Globe`，不改变 Globe 的 material 行为。
- 不为了目录统一迁移 Cesium upstream shader，也不手工维护生成的 Shader `.js`。
- 不在 S1 提前加入 imagery filter 或 terrain styling 产品行为。

## Stable architecture boundaries

1. 固定 GLSL 主体与公共函数进入独立 shader source；layer count、variant selection、uniform declarations 与只在运行时可知的组合继续由 JS 负责。
2. SceneGIS shader 使用 Cesium 现有 `Source/Shaders/**` GLSL-to-JS、dev/release 和 npm delivery 链。SceneGIS 新根为 `packages/engine/Source/Shaders/SceneGIS/**`，必须在 Architecture/ADR 中明确 ownership 与升级边界。
3. 生成的相邻 Shader `.js` 仍是 build artifact，不手工编辑或提交。运行时 JS 只导入构建生成模块；Specs、dev/release 和 installed package 都必须证明链路闭合。
4. Surface 继续按 shown imagery layer count、lighting 与 normal mode 缓存 shader variant；styling phase 可以扩展显式 key，但 uniform-only 变化不得触发 request、texture、mesh、VA 或 command 重建。
5. Imagery filter 在每层 texture sample 后、alpha composition 前执行；bottom-to-top 顺序、single opaque command 与 texture-unit fail-fast 不变。
6. 首批 imagery filter 限于 brightness、contrast、hue、saturation、gamma、color-to-alpha/threshold 和 alpha。默认值必须产生与当前画面等价的 fast path。
7. Terrain height 使用米制 world Z；slope 从 stable topology-up world-axis normal 与 `+Z` 计算；aspect 使用固定 planar axes，定义为从 `+Y` north 顺时针；contour 以米制高度和 screen derivatives 抗锯齿。
8. Terrain styling 优先研究复用 Cesium `Material` 的 fabric、uniform 与 shader-source 组合能力，但不得把 Globe 提供的 ellipsoid/cartographic input 或 private Globe shader contract 当成 planar API。若不能安全复用，收缩为 SceneGIS-owned terrain-style contract，并以 ADR 记录。
9. Styling 应在 imagery composition 后形成明确的颜色/材质合成顺序，再进入既有 lighting；默认配置必须保持当前 unlit/lit 像素和 depth/pick replay。
10. 调用方继续拥有 imagery/terrain providers；extension 不增加 tile request、texture duplicate、terrain mesh 或长期全局 registry。
11. 默认只修改 SceneGIS-owned 路径。任何 upstream-owned 修改必须先证明无现有 seam、登记 SGP，并使用最小 paired marker 或合法 manifest-only 记录。
12. Phase 串行推进；每个 phase 必须实现、验证、Architecture/code review、必要 manual gate 与本地中文 checkpoint 后，才能激活下一 phase。

## Source and baseline facts

- Base 为 `2086e5e42038dfdde23220dea8a33395445e6cd8`，工作区 clean；新分支为 `feature/planar-surface-styling`。
- `_SceneGISPlanarSurfaceShader.js` 内嵌三个 vertex shader，并动态生成 imagery declarations/composition、lighting declarations 与 fragment body。
- `_SceneGISPlanarGroundLineShader.js` 内嵌 area/line vertex 与 fragment shader；普通 public planar Primitive 路径继续复用 Cesium Appearance/Primitive shader，不属于迁移目标。
- `SceneGISPlanarImageryLayer` 当前仅有 `show` 与 `alpha`；Surface 每层绑定 texture、translation/scale 和 alpha 后自底向上合成。
- `scripts/build.js` 当前只扫描 `packages/engine/Source/Shaders/**/*.glsl` 和 ThirdParty shader，将每个 GLSL 转为相邻 JS default-export string；`packages/engine/.gitignore` 已忽略 `Source/Shaders/**/*.js`。
- Engine build 在 bundling/index generation 前执行 GLSL 转换；engine npm 包包含 `Source` 和 `Build`，同时排除 `Build/minifyShaders.state`。因此 `Source/Shaders/SceneGIS/**` 可复用完整现有链，无需扩展 glob。
- Cesium Globe 通过 Material shader source 为 terrain 提供 height、slope、aspect、normalEC 与 st，但该接入由 Globe shader 与 ellipsoid runtime 组装，不能直接假定适用于 planar Surface。
- Completed A6/A7 已提供 meter-metric、fixed planar world-axis oct normal；这使平面 slope/aspect 具备稳定输入，但不等于 terrain material API 已确认。

## Phase roadmap

| Phase | Objective                                                                                     | Dependencies            | Entry gate                                                                              | Exit gate                                                                                   | Status      | Phase plan                                                |
| ----- | --------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------- |
| S1    | 建立独立 SceneGIS GLSL source/delivery foundation，并等价迁移现有自有 Surface/Ground shader。 | predecessor checkpoints | 审计 shader glob、生成物、imports、dev/release/npm 与现有 shader variants。             | ADR/Architecture ownership 完成；内嵌主体迁出；现有像素、cache、资源和三种交付形态等价。    | `completed` | [S1](2026-08-12-phase-s1-shader-source-foundation.md)     |
| S2    | 为 planar imagery layer 增加坐标系无关的颜色滤镜。                                            | S1 checkpoint           | 重新审计 layer mutation、uniform map、cache key 与 Globe filter math。                  | 公共属性、默认等价、uniform-only mutation、组合顺序、错误与生命周期通过 Specs/manual gate。 | `active`    | [S2](2026-08-12-phase-s2-planar-imagery-color-filters.md) |
| S3    | 建立 terrain height/slope/aspect/contour styling contract，并决定 Material 复用边界。         | S2 checkpoint           | 重新审计 Cesium Material/Globe inputs、planar normals、world height 与 shader variant。 | 已批准 contract 与合成顺序实现；四类 styling、lighting/underground/LOD 与资源边界闭环。     | `planned`   | Not created                                               |
| S4    | 完成统一资格、案例、发布与升级交付。                                                          | S3 checkpoint           | S1-S3 review/checkpoint 完成；固定最小资格矩阵与 manual gate。                          | filters + terrain style 在 dev/release/npm、真实 WebGL/GPU、lifecycle 与文档中统一闭环。    | `planned`   | Not created                                               |

## Cross-phase validation

- Jasmine 公共契约、shader source/variant 与失败输入 Specs。
- Real Context 像素、single command、uniform-only mutation、shader/resource warm identity 与 destroy balance。
- Development build、release build、installed npm tarball 的 Shader module/import 资格。
- 复用或最小扩展 SceneGIS Sandcastle 进行滤镜和 terrain style 人工视觉 gate；自动化不得访问公网。
- 每 phase 运行 ownership/generated-file/SGP 审计与 scoped static checks。

## Global risks and dependencies

- `Source/Shaders/SceneGIS/**` 是新 ownership root，必须由 ADR-0030 与 Architecture 明确；官方升级需复核 shader converter glob、生成 JS ignore、index naming 和 package files。
- 动态 fragment 不能完全静态化；错误地把 layer declarations 固定到 GLSL 会导致 variant 爆炸或失去 texture-unit 边界。
- Cesium Material 是通用系统，但 Globe terrain input 组装不是通用 API；S3 必须以源码与 tests 证明可复用范围。
- Hue/gamma/color-to-alpha 的颜色空间与 premultiplied alpha 顺序容易造成 Globe/planar 默认差异，S2 必须冻结数学与合成顺序。
- Contour derivative 与 slope/aspect normal 会受到 LOD、double-sided viewing 和 large-extent precision 影响，S3 必须复用 A7 meter/world-axis normal 证据并补真实像素 gate。

## Overall acceptance criteria

- SceneGIS 自有固定 shader 主体不再主要内嵌于 JS，且不引入手工生成物或上游 build patch。
- Planar imagery 支持批准的常用颜色滤镜，默认画面不变，修改仅更新 uniform/state。
- Planar terrain 支持可组合的 height/slope/aspect/contour styling，定义与固定 planar axes、米制 Z 一致。
- 所有能力保持 single-command Surface、imagery/terrain ownership、lighting、pick/depth replay、warm resource identity 和 exactly-once destroy。
- Dev、release、installed package、focused Specs、真实浏览器/GPU manual gate、Architecture review 和 durable docs 全部完成。

## Progress and handoff

- S1 implementation、自动化验证、Architecture review与本地checkpoint
  `04ac138b37295f328f3542f143b2f6b738a7e021`已完成。
- S2 已依据 checkpoint 后源码审计建立 [confirmed phase plan](2026-08-12-phase-s2-planar-imagery-color-filters.md)，等待 Execution 实现；S3-S4 仍只保留稳定目标与 gate。
