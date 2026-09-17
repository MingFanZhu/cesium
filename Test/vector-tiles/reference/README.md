# 公开地图参考与授权

## MapLibre 示例来源：OpenFreeMap Bright

用户参考项目的 `test/examples/display-buildings-in-3d.html` 与
`test/examples/add-a-vector-tile-source.html` 使用
[OpenFreeMap Bright](https://tiles.openfreemap.org/styles/bright)；本页默认采用相同来源。
对应 [MapLibre 官方示例](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/)。
基础 `display-a-map.html` 使用的 demotiles 是 countries/geolines 世界地图，
本轮选择 Bright 的道路/建筑/水域作为实际街区验收基线。

Bright 与 Liberty 均从 [公开 TileJSON](https://tiles.openfreemap.org/planet)
获取实时 MVT，使用 OpenMapTiles schema，无需 token；没有引入 MapLibre renderer。
按负责人选择，已移除 Mapbox 在线入口。Streets 文件保留作离线样式参考。

`openfreemap-bright.json` 是 2026-09-13 获取的完整 119 层快照，仅统一缩进，供离线 E2E 使用。
`bright-profile.json` 当前只排除 `building-top` 的 fill-translate；
其余 118 层保留原顺序；V3D1 示例把 building 改为 fill-extrusion，按 render_height/render_min_height 拉伸楼栋。
V5A 新增 15 个 point layers，V5B 新增 10 个道路/水系名称、路牌与箭头层；数量不代表视觉完成比例。
线上页面读取公开 style URL，遇到新的不支持配置会报错，不静默删属性。

Bright 由 [OpenFreeMap Styles](https://github.com/hyperknot/openfreemap-styles) 维护，
源自 [OSM Bright](https://github.com/openmaptiles/osm-bright-gl-style)，后者继承 Mapbox Open Styles。
Style code 按 BSD 3-Clause，设计按 CC BY 4.0；版权归 MapTiler.com、OpenMapTiles contributors、
Mapbox 及相应修改作者。全文见 [BRIGHT-LICENSE.txt](BRIGHT-LICENSE.txt)、
[OPENFREEMAP-LICENSE.txt](OPENFREEMAP-LICENSE.txt) 和 [MAPBOX-LICENSE.txt](MAPBOX-LICENSE.txt)。
页面提供此署名入口，地图角落保留 TileJSON 的 OpenFreeMap / OpenMapTiles / OpenStreetMap attribution。
建筑拉伸当前支持实体屋顶、侧墙和孔洞；完整边界见矢量瓦片文档。

## Mapbox Streets v12：离线参考

`mapbox-streets-v12.json` 来自 Mapbox 官方公开仓库
[mapbox/mapbox-gl-styles](https://github.com/mapbox/mapbox-gl-styles/blob/c4b34ab336fdb70be489fa018f2fe9e6f341b4f5/styles/streets-v12.json)，
固定 commit 为 `c4b34ab336fdb70be489fa018f2fe9e6f341b4f5`。
仅统一 JSON 缩进，保留完整 134 层原始定义；没有附带 token、瓦片、字体或 sprite。

样式代码按 BSD 许可，设计按 CC BY 3.0，原始授权全文见 [MAPBOX-LICENSE.txt](MAPBOX-LICENSE.txt)。
Style design © Mapbox；署名不表示 Mapbox 对本项目的认可。
地图数据的授权不包含在样式代码许可中，当前页面不调用 Mapbox 官方服务。

`streets-profile.json` 是离线能力审计的显式排除清单，其余 97 层通过当前 Style.validate；
对无法处理的属性不做删除或近似替换。

| 待实现                        | 层数 | 例子                                     |
| ----------------------------- | ---- | ---------------------------------------- |
| 标注、字体、图标与 placement  | 32   | road-label、poi-label 等                 |
| fill/line translate 与 anchor | 2    | water-shadow、waterway-shadow            |
| fill-pattern / sprite         | 1    | road-pedestrian-polygon-pattern          |
| circle-pitch-alignment: map   | 2    | turning-feature、turning-feature-outline |

97/134 表示样式层通过当前前端检查，不表示默认图像完成 72%、
不保证每一层在每个地点/zoom 都有数据，也不构成 Mapbox 官方瓦片的在线验收。
Mapbox SDK 当前默认是 [Standard](https://docs.mapbox.com/mapbox-gl-js/guides/styles/)，
经典 Streets v12 是后续渐进差距参考；未实现 Standard 的 imports/config/slots。

## OpenFreeMap Liberty

线上页另提供 [OpenFreeMap Liberty](https://tiles.openfreemap.org/styles/liberty) 与
[公开 TileJSON](https://tiles.openfreemap.org/planet)，采用 OpenMapTiles schema；
不会把它们改名为 Mapbox Streets 数据或套用 Streets 的字段假设。
`openfreemap-liberty.json` 是 2026-09-13 获取的同一 111 层样式快照，仅用于无需公网的 E2E。
`liberty-profile.json` 当前显式排除 2 层：raster 与含 `fill-translate-anchor` 的湿地层；
其余 109 层接入，包括 V5B 的沿线标注、V3D1 的 building-3d 与 V3D2 的 road_area_pattern。
湿地图案本身已支持，但该层仍包含 profile 外的 translate-anchor，页面不会静默删除该属性。
以后线上样式出现新的不支持配置会报错，不静默删属性。

Liberty 由 [OpenFreeMap Styles](https://github.com/hyperknot/openfreemap-styles) 维护，
源自 [OSM Liberty](https://github.com/maputnik/osm-liberty)，后者源自 OSM Bright / Mapbox Open Styles。
OpenFreeMap 代码为 MIT，继承的 style JSON 为 BSD；设计保留其 CC BY 署名条件。
全文见 [OPENFREEMAP-LICENSE.txt](OPENFREEMAP-LICENSE.txt)、
[LIBERTY-LICENSE.txt](LIBERTY-LICENSE.txt) 和上述 Mapbox license。
地图角落显示 OpenFreeMap、OpenMapTiles 和 OpenStreetMap attribution。
此目录不下载或分发线上 OpenStreetMap 瓦片。

## 本地自动化数据

`../public-fixture.pbf` 由 SceneGIS 自行编写的
[generate-public-fixture.mjs](../generate-public-fixture.mjs) 生成，包含五个合成要素，
分别验证 transportation、transportation_name、water、building 与 poi；不含下载的地图内容，不表示真实地理对象。
E2E 拦截网络并使用该 MVT 和固定 Bright/Liberty 样式快照；所有外部请求均被拦截。
公网 smoke 是单独、有限的在线检查，不是 CI 的运行前提。

V5A 在线页面使用 style 声明的 OpenFreeMap glyphs/sprite；无额外字体 fallback。
sprite 中缺少某些 POI image entry 时保留文字，并在页面提示名称，和 MapLibre 的行为一致。
本地 CI 使用 [点标注字体](../symbol-assets/README.md) 与 [沿线图标](../line-symbol-assets/README.md)，保留 Noto 的 SIL OFL 许可。
