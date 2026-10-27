# 纽约建筑 PBR 材质

从仓库根开发服务器打开 `Test/vector-tiles/building-materials/`。
`?world=globe` 为球面，`?world=planar` 为纽约局部米制平面。
runtime 仅加载 `/Build/CesiumUnminified/index.js`；引擎修改后按开发流程重新构建。

页面支持同一相机白天 / 傍晚、近 / 远景、材质 / 纯色、SSR、阴影、z14 瓦片边界、
建筑拾取及重新加载。白天为 `2026-10-10T18:00:00Z`，傍晚为 `2026-10-10T21:40:00Z`。
按负责人要求直接读取 OpenFreeMap 公网 TileJSON 与 MVT，不保留街区快照，也不提供地图 fallback。
网络失败显示在页面，可用重新加载按钮主动重试。

## 数据与配置

- 地图：[OpenFreeMap](https://openfreemap.org/)、[OpenMapTiles](https://openmaptiles.org/)、
  [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。署名同时显示在页面。
- 配置：`materials.js`。两种石材、暖砖、三种幕墙颜色和两种屋顶独立选材。
  源 `colour` 分类优先，再按楼高和稳定 ID 变化，避免所有高楼使用同一种窗格。
- decoded MVT ID 是字符串，必须 `to-number` 后进行取模；示例纽约 ID 在 safe integer 范围。
  不应将这个数值方案照搬到超出 safe integer 的 ID，应改用稳定字符串/属性分类。
- 石材和砖立面为 4 × 4 窗格，横向重复 8.8–10 m，竖向 12.8 m，即层高 3.2 m；
  玻璃为 14 × 8 窗格，重复 21 × 25.6 m，铜色变体层高 3.5 m；屋顶重复 16 × 16 m。
- Globe 材质使用固定纽约 Mercator 原点与当地纬度比例；Planar 完整 XYZ matrix
  平移缩放为当地实际米，瓦片编号和公网 URL 不变。
- 墙/屋顶材质、图集、mip、光照、UV、调度和销毁均由引擎承担，示例不实现渲染路径。
  公共 API 见 [VectorBuildingMaterials](../../../Documentation/SceneGIS/VectorBuildingMaterials.md)。

## 素材来源与加工

| 文件组                                  | 来源                                                                                                    | 许可 / 记录                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `glass-*`                               | [ambientCG Facade006](https://ambientcg.com/view?id=Facade006)，`Facade006_1K-PNG.zip`，2026-10-27 获取 | [CC0 1.0](https://docs.ambientcg.com/license/)；允许原始素材随示例分发                             |
| `limestone-*`、`brick-*`、`roof-flat-*` | 用户授权后通过内置 imagegen 生成的原创素材，非参考视频贴图提取                                          | 随本仓库示例及其 Apache-2.0 许可分发；不标为 ambientCG 或 CC0；[完整提示词](source-art/PROMPTS.md) |

`source-art/*.png` 保留原创原始输出。`textures/` 保存运行时 256 × 256 图片；
同一颜色图可被多个材质描述复用，所有楼栋共用 Layer 的四张图集和一张参数表，总计约 16.7 MiB。

`prepare-textures.mjs` 仅供开发时加工，需要 Node 与可选 `sharp`，不被浏览器或引擎导入。
将 [Facade006 原包](https://ambientcg.com/get?file=Facade006_1K-PNG.zip) 解压到
忽略的 `Build/material-sources/Facade006_1K-PNG/`，然后运行：

```sh
node Test/vector-tiles/building-materials/prepare-textures.mjs
```

脚本缩小颜色/OpenGL 法线，打包 G=粗糙度、B=金属度。原创立面的伴随通道是按冷色窗户像素
推导的近似值，使用较光滑的玻璃、粗糙墙体、窗洞法线和少量固定亮窗；不是实测 PBR 扫描。
屋顶设备属于纹理细节，没有新增设备几何或投影。玻璃使用有反射的不透明风格化外墙模型，
没有内部房间、透射或折射。素材中少量窗框明暗仍来自原图，不代替太阳与几何阴影。

## 验证与边界

Chrome 156 / RTX 3060 Ti，1440 × 1000，HDR、AO、SSR、原生建筑阴影与 FXAA 开启：
在最终道路过滤前的同一纽约视角采集 90 个 warm frame，PBR / 纯色均为 116 个矢量绘制命令。
CPU 中位数 3.8 / 3.6 ms，GPU timer 中位数 14.78 / 13.47 ms；这是整帧局部对照，
不是跨设备帧率承诺。保留材质库后关闭选择器不释放图集，移除 Layer 才释放。
球面和平面各两次移除/重建、最终重复 destroy 均释放五张材质纹理，无页面错误。

引擎 Core/Worker 专项 10/10、发布版材质 GPU 专项 18/18 通过；完整构建和类型检查通过。
画面与自动化结果汇总在 [B3 review](../../../AgentDocs/vector-tiles/reviews/2026-10-27-b3-material-example.md)。
负责人视觉 gate 保持待确认，原 D2 gate 独立保留。

材质 ID/相位在源 ID、属性和直线墙朝向不变时稳定；原数据独立 building part、简化轮廓、
地形 anchor 或跨级属性变化仍可能产生差异，不做楼栋拓扑拼接。
示例建筑 minzoom 为 13，低于此范围隐藏；远景也受源数据和现有可见瓦片预算约束。
SSR 仅反射屏幕内可见物体，未命中处使用天空。远处细窗会通过 mip 收敛，不能保持近景细节。
