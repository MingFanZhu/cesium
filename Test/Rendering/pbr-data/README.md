# PBR 验收数据

[主体基准](../PBR基准.html?world=planar)与[综合验收](../PBR综合验收.html?world=planar)
均支持 `world=globe`。综合页是 SceneGIS 组装场景，不是 Intel 原场景。
默认 `textures=2k`，`textures=original` 使用解包后的原始 4K 纹理。

## 固定来源与署名

精确版本、下载地址和 SHA-256 见 [manifest.json](manifest.json)。

| 资产                       | 来源、作者                                                                                                                                                                                                 | 用途                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| New Sponza Main glTF 003   | [Intel Sample Library](https://www.intel.com/content/www/us/en/developer/topic-technology/graphics-research/samples.html)，Frank Meinl、Anton Kaplanyan，2022；包内 exporter 为 3ds Max 2024 / 20240125.3  | 375 万三角面，28 种材质，72 张 4K 纹理                  |
| Sponza Curtains            | 同上，另含 Addon Package Crew 署名，以包内完整 credits 为准                                                                                                                                                | 200 万三角面，4 种材质，8 张 4K 纹理                    |
| MetalRoughSpheres          | [Khronos](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/c6a6bd13ab2b3c685c7903d03561b8a9392f38b8/Models/MetalRoughSpheres)，Analytical Graphics, Inc. / Ed Mackey，CC BY 4.0                     | 纹理控制的金属度/粗糙度矩阵，约 50 万三角面             |
| FlightHelmet               | [Khronos](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/c6a6bd13ab2b3c685c7903d03561b8a9392f38b8/Models/FlightHelmet)，Public / Gary Hsu，CC0                                                    | 皮革、木材、橡胶、金属，约 9.5 万三角面；镜片透射待支持 |
| GlassHurricaneCandleHolder | [Khronos](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/c6a6bd13ab2b3c685c7903d03561b8a9392f38b8/Models/GlassHurricaneCandleHolder)，Wayfair / Eric Chadwick，CC BY 4.0，另保留 Khronos 标识说明 | 透射/体积玻璃待支持样本，4126 三角面                    |

Intel 两个包的 `credits_license.txt` 开头写有个人、教育用途及有限商业用途说明，后文又
附 CC BY 4.0 正文；这里原样保留完整文本，不把它简化成无限制商用授权。数据用于本地
渲染研发/验收，不进入 Git、npm 包或发布站点。使用、引用及后续分发以原许可为准。

完整原文位于准备后的
[主体 credits](local/main_sponza/credits_license.txt)、
[窗帘 credits](local/pkg_a_curtains/credits_license.txt)、
[Khronos 各模型 README](local/khronos/Models/GlassHurricaneCandleHolder/README.md)
及 `local/khronos/LICENSES/`。脚本保留全部署名和许可文件。

## 准备本地数据

从仓库根目录运行。需要 Node 24.5+、系统 `tar`（支持 ZIP）和约 12 GB 空闲空间。
首次下载 Intel 两个原始包合计约 4.8 GB，加上 Khronos 资源；之后从校验过的缓存重建。

```sh
npm install --prefix Build/pbr-reference/tools --no-save --package-lock=false sharp@0.34.5
node --use-env-proxy scripts/scenegis/prepare-pbr-reference.mjs
```

也可以把已下载的官方 ZIP 放入 `Build/pbr-reference/main_sponza.zip`、
`Build/pbr-reference/curtains.zip`，脚本仍会检查 manifest 中的散列。系统有代理时
`--use-env-proxy` 让 Node 使用既有代理配置。脚本失败会明确报错，不自动更换来源/版本。
`local/prepared.json` 是成功完成后的本地准备记录。页面缺数据时提示准备命令，不请求公网。

原始归档位于忽略的 `Build/pbr-reference/`；只提取 glTF 引用的 buffer、纹理与完整许可到
忽略的 `local/`，不提取 Max、FBX、USD、作者截图等无关文件。Git 只保存脚本、清单与说明。
`tar` 按固定条目流式提取，不把 4 GB ZIP 一次读入 JS 内存。

## 交付派生与资源预算

- 原始 glTF、buffer、材质、法线属性和三角面完全保留，未重新计算法线或简化网格。
- 2K 版的 glTF 和 buffer 与原版逐字节相同，路径相同，只有 Intel PNG 缩为最长边 2048。
  使用 sharp 0.34.5 / Lanczos3；颜色纹理采用 gamma 2.2 近似线性缩放，数据纹理直接缩放，
  法线纹理缩放后重新归一化。它会改变纹理细节，不能冒充原始 4K 图像。
- 原始主体 72 张 4K RGBA 纹理含 mipmap 约 **6 GiB**；2K 版约 **1.5 GiB**。
  加窗帘与 Khronos 样本，综合页纹理估算约 **2.0 GiB**，原版约 **7.0 GiB**。
  这是 RGBA8 最坏常规预算，不是 GPU 实测；还需几何、阴影、MRT、TAA 历史等显存。
- 主体 3,747,018 三角面 / 405 glTF primitive；加窗帘和样本约 6,345,008 三角面，
  加水池/底座只有少量附加三角面。不代表流式城市场景性能。
- Draco/KTX2 重编码、LOD、纹理压缩等不在本阶段范围；保持验收资产可追溯。

## 空间、照明与已知缺口

源模型单位为米、Y-up。示例显式使用 `Model` 的 `upAxis: Axis.Y, forwardAxis: Axis.X`，
对应局部 `[x, -z, y]`。Globe 只在同一局部场景外增加 ENU→ECEF 变换，Planar 使用局部米制。
主体包围范围约 36.25 × 23.77 × 19.89 米。示例提供俯瞰全景、中庭、上层与拱廊视角，
另有“屋顶与天空”用于观察大气，综合页还提供三个样本近景。

默认启用 `SceneGISEnvironmentEffects` 物理大气，并由天文太阳位置驱动光照、天空漫反射和
环境反射。两个 World 均采用参考经纬度 `-75.596, 40.038`；Planar 使用
`SceneGISPlanarEnvironment` 的 astronomical 模式，Globe 使用原生太阳位置。
默认冻结在 `2026-06-21T19:00:00Z`，可调 2026 年内日序和 UTC 小时。

“物理大气与光照”面板支持物理天空、空气透视，分别调节天空、空气散射和物体光照亮度，
以及总曝光。“高度雾”提供密度、高度衰减、基准高度、起雾距离和最大不透明度。
这里复用现有大气模型；亮度控制不改变 Rayleigh/Mie 系数或重新生成散射 LUT。
可切回“固定 IBL”：恢复初版固定方向光、diffuse SH 和仓库既有
`kiara_6_afternoon_2k_ibl.ktx2`，作为稳定的光照对照；曝光在两个模式都生效，其余大气参数
仅在物理模式生效。“恢复大气基准”会恢复参数并暂停时间，不改变相机。
环境图复用既有 Cesium Specs 资产；本阶段未新增或修改该文件。
主体 glTF 的 `KHR_lights_punctual` 不导入；本页光照是明确指定的 SceneGIS 验收配置。
统一天空 IBL 尚无室内遮挡、空间探针或 GI；SSR 只反射屏幕内可用几何。

玻璃原始扩展保留。灯罩的 `KHR_materials_transmission` / `KHR_materials_volume`、头盔
镜片的 transmission 当前不受 Model 支持，画面中这些部分只呈现核心材质的局限，不能作为
正确玻璃结果。未用 alpha blending 替换它们。水池使用既有 `SceneGISWaterSurface`，冻结
时刻便于比较；综合页可播放时间，同时推进水面和太阳，暂停后回到所选时刻。
水面自己的反射与模型 SSR 开关相互独立。

A 为几何阴影 + TAA，B 默认增加 AO / SSR。两者共用相机、灯光、曝光与资产，B 参数切回 A
后仍保留，切换 A/B 不修改大气参数。导出配置记录资产版本、纹理规格、相机、光照、
大气参数、时间、效果参数及绘制分辨率；
跨版本验收另保存 Git revision 与同尺寸截图。新渲染能力仍需要独立示例。

两个页面使用 Viewer 原有相机控制：Planar 为默认地表 controller，Globe 为原生控制，
左键平移、中键旋转、滚轮缩放。固定视角采用符合地表导航俯角范围的查看姿态，不再使用
作者的仰视相机或示例自定义环视操作；恢复固定视角可回到确定的验收姿态。
