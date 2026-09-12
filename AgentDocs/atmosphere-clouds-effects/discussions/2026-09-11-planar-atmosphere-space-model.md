# Planar atmosphere and cloud space-model discussion

## Metadata

- Type: `discussion`
- Status: `resolved geometry, units and direct-Z height; P1 foundation implementation authorized`
- Owner role: Architecture Agent with project owner
- Created / updated: `2026-09-11`
- Parent extension:
  [Atmosphere and clouds](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Current phase:
  [P1 restoration](../plans/2026-09-02-phase-p1-planar-integrated-medium-restoration.md)
- Related review:
  [P1 review](../reviews/2026-09-02-p1-planar-integrated-medium-restoration.md)
- Existing decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0042](../../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- New upstream changes / SGP: none

## Scope and current evidence

项目负责人要求先讨论 Globe 向 Planar 的移植，比较空间差异和 UE 做法。保留已测试但未验收、
未提交的 P1 candidate。讨论后项目负责人已授权实现，范围见 P1 的 September 11 assignment。
以下备选方案保留为选择依据；
项目负责人已确认全球米制平面用途、固定 Z 几何与直接 Z 高度，支持多种及自定义坐标系。
高度简化已提升到 ADR-0040 的 2026-09-11 clarification。

讨论时的 Planar 按固定 `+Z` 计算高度，使用独立 flat-slab atmosphere LUT 和平层云求交。
`SceneGISVolumetricClouds.glsl` 的 `sceneGISCloudSegment` 已分别实现 sphere/slab 分支；
高度、天气坐标、材质、步进和光照仍存在较多 Globe 专用路径。Planar 的旧相机距离淡出
在 60–100 km 生效，是现有高空云消失的原因之一，不是平面空间的必然限制。

讨论时 `_private/_SceneGISEnvironmentEffectsRenderer.js::executeCloudResolve` 仅为 Globe 启用
运动重投影；P1 当前实现已向 Planar 接入相机与风的重投影并移除距离密度淡出。
深度修复和正确合成不能单独带来 Globe 的完整材质与时序质量。
当前差距应分成空间模型差异和尚未移植的质量功能，不能合并归因为球面和平面。

## UE evidence

- [Sky Atmosphere component](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-in-unreal-engine)
  明确提供 `Ground Radius`、大气高度和 planet top / planet center transform modes。
  常规平面地形坐标与大气使用球面几何是两项独立选择。
- UE 5.2 本地参考源码
  `Engine/Source/Runtime/Renderer/Private/VolumetricCloudRendering.cpp`,
  `FSceneRenderer::InitVolumetricCloudsForViews`，读取 SkyAtmosphere 的行星中心与地表半径；
  无 SkyAtmosphere 时使用云组件半径并把中心置于 `(0, 0, -R)`。
  云底半径为 `R + LayerBottomAltitude`，云顶再加 `LayerHeight`。
  这确认原生云层包围域是球壳；云材质在该包围域内决定实际密度。
- [Volumetric Cloud component](https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-cloud-component-in-unreal-engine)
  将体积材质、步进、低分辨率重建、天空光和云影分工；阴影可用 secondary ray marching 或
  Beer shadow maps。其质量模式与代价不能直接等同于 Cesium/WebGL 的可实现性能。
- [Cloud reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-clouds-reference?application_version=4.27)
  区分到达云层前的最大距离和进入云层后的步进距离。
  该页面是 4.27 参考，几何结论另外由上述 5.2 源码确认。

SkyAtmosphere 用 transmittance、multiple scattering、sky-view 和 aerial-perspective LUT
减少实时积分成本。可以借鉴计算分工；本次移植没有证据要求替换现有 Globe 的 Bruneton LUT
或同时重写预计算系统。UE 的原生云系统也不是严格无限平层的直接参考答案。

## Options and tradeoffs

| 方案                       | 收益                                              | 空间代价与边界                                                                                     |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 固定 Z 大气与平层云        | 高度语义与大范围平面地图一致；延续现有契约        | 浅角度路径很长，水平射线可能不离开介质；需要专门的积分、采样和远距离策略；日落与高空轮廓不同于球面 |
| 平面场景加球面大气、球壳云 | 接近 UE 原生模型；可较多复用 Globe 光学与曲率效果 | 光学球只在局部与地形相切；远处平地与云层高度不一致，须明确有效区域、光学原点和半径；需修订现有 ADR |
| 球面天空加平层云           | 保留局部云高语义，获得球面天空外观                | 云处受光、地面受光和视线透射来自不同几何，需显式定义映射与误差；不宜未经验证作为默认捷径           |

取地球尺度 `R = 6371 km`，离固定切点水平距离 `d` 的曲率差约为 `d² / (2R)`：
10 km 约 8 m，100 km 约 785 m，500 km 约 20 km。这是球面与切平面的几何量级估算，
不是渲染误差实测。固定球壳无法无条件覆盖全国范围的平面地形。

不以巨大半径代替平面推导，也不默认让光学球心跟随相机。前者改变光程和 LUT 参数域；
后者改变世界中的云层与光学高度，必须先解决天气锚点、光照和历史连续性。

## Shared implementation direction under fixed-Z geometry

- 将空间适配集中在高度 / up、射线介质区间、稳定天气坐标和地表遮挡；光学材质与积分消费明确结果。
- 复用已验证的云形、侵蚀、相函数、透射积分和质量策略，同时核对 Globe/Planar 的密度单位、纹理
  采样语义及辐射定标。不能只移除 `SCENEGIS_GLOBE` 宏。
- Planar 可按世界位置和上一帧相机进行重投影，结合风偏移、深度拒绝与大坐标精度管理。
  平面几何不构成阻碍，但现有策略需要单独移植验证。
- 云体、表面模型、天空与雾共同消费太阳 / 月亮方向及相容的光学透射。
  继续遵守项目负责人要求，保留 Cesium 原有阴影开关，不增加另一个开关。
- 分开 camera-to-medium entry、medium integration budget 与远处云材质的距离淡出；
  不以调大一个总距离常量代表高空支持。

## Owner decision — 2026-09-11

项目负责人明确实际需求是全球层面的平面，因此选择固定 Z 几何。随后明确平面采用 m 为单位，
适配多种坐标系并支持自定义；EPSG:3857 仅为当前示例，不是环境系统的固定坐标系或算法前提。
这确认 ADR-0040 / ADR-0042 已有的 fixed-Z / flat-slab 决策，无需新增球面光学模式或改写该边界。
UE 式局部切平面加球壳的方案不再作为本次 Planar 移植候选；Globe 保留原有曲率模型。

源码核对确认 `_SceneGISAtmosphereReferenceFrame.js::publishPlanar` 使用固定 XYZ 轴，其旧内部表达为
`altitude = position.z - baseHeight`；`_SceneGISEnvironmentEffectsRenderer.js::updateFrame` 固定传入
`baseHeight: 0.0`，公开 Controller 没有独立 `baseHeight` 配置。项目负责人要求契约直接使用 `height = z`，
不保留可配置环境高度偏移。当前运行路径与此一致，后续适配可简化冗余内部表达。

环境系统的输入契约是当前 World 的米制平面坐标、固定 `+Z`、`z = 0` 零高度及环境光方向。
位置、云层高度、云形尺寸和光程使用 m；风速使用 m/s，时间使用 s，消光系数对应逆米。
环境算法不解析 CRS 名称、不从 XY 反推经纬度，也不增加 CRS 专用纬度缩放。
数据进入 World 前的投影或坐标转换属于现有坐标 / 数据接入边界，不能由云 Shader 隐式承担。

`cloudBaseHeight` 是云层位置控制，仍保留：Planar 云底 Z 直接为该值，云顶再加 `cloudThickness`。
地形和模型使用实际世界 Z；环境高度不自动减地形高程，也不要求地形位于 Z=0。

## Remaining design and handoff

下一步设计以以下边界收敛，不重新询问场景范围或空间模型：

- **坐标与尺度**：按已确认的米制平面契约统一云、云影、深度、光程与风偏移的单位。
  高度直接使用 Z，云层包围域和光学密度均不增加另一个环境高度偏移。
  天气噪声以世界锚点及米制尺度采样，不能绑定 Web Mercator 的范围、原点或包裹宽度。
  资格验证应包含自定义米制坐标系；同一环境算法不因 CRS 名称改变行为。
- **大坐标稳定性**：在固定世界天气锚点下评估相对坐标 / 高低位分解等现有精度机制，保持移动相机时
  云形和云影不漂移。全球范围支持不意味着每个像素遍历整张地图。
- **长光程**：保留真实 slab 求交，分开进入介质的距离、内部积分预算与天气密度域；定义近水平采样、
  细节 LOD 与透射收敛。现有 60–100 km 淡出不能作为全球或高空可见性的验收依据。
- **质量移植**：依据现有 Globe 源码逐项适配云材质、稳定重投影、统一光照与云影；继续使用独立平面
  atmosphere LUT，保留 Cesium 原有阴影开关。相同质量目标不要求球面日落与太空轮廓像素一致。

Architecture 负责固定 Z 适配设计与后续阶段边界。P1 原有验证及未提交 candidate 保留，
视觉 finding 继续 open；选择空间模型不代表 P1 视觉验收、实现完成或下一阶段激活。
