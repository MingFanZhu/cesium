# 南京中心城区建筑白模

- 数据：© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。本目录 GeoJSON 为该数据库的衍生提取，仍按 ODbL 提供。
- 范围：118.755–118.815°E，32.020–32.070°N，约 5.7 × 5.6 公里；中心 118.785°E / 32.045°N。
- 快照：2026-09-29T03:34:50Z，通过 VK Maps 公共 Overpass 实例提取。
- 原始响应 SHA-256：`48790ad0a492afd57a2e8fdf85d2dc000fd6ecd7ee7b0c838890da83ec5471bd`。
- 转换工具：`osmtogeojson@3.0.0-beta.5`，临时离线工具，不作为运行时依赖或源码分发。
- 保留 WGS84 轮廓及内环，不简化、不随机移动、不复制建筑；剔除一条 `building=no` 地下商业区记录。
- 共 5,607 条建筑面、37 个内环；501 条采用正值 height 标签，315 条按 building:levels × 3 米估高，4,791 条缺失高度统一显示 12 米。估算值用于天气观察，不作为实测高度。
- 只保留 OSM ID、建筑类别及派生高度/来源字段。原始坐标保留；模型统一自椭球高 0 挤出，未接入实测地形/屋顶形状/材质。
- `buildings.geojson` 随示例本地提供，浏览器不访问 Overpass、地图瓦片或 ion 服务；可直接下载查看全部派生数据。

## 重现提取

查询如下；公共源持续更新，重新提取不会得到完全相同的快照。

```text
[out:json][timeout:90];
(
  way["building"](32.020,118.755,32.070,118.815);
  relation["building"]["type"="multipolygon"](32.020,118.755,32.070,118.815);
);
out geom;
```

将响应保存到 `Build/weather-nanjing-osm.json`，然后从仓库根目录执行：

```powershell
npm install --prefix Build/weather-data-tools --no-save --no-package-lock --no-audit --no-fund osmtogeojson@3.0.0-beta.5
node scripts/scenegis/prepare-weather-city.mjs
```

提取接口：<https://maps.mail.ru/osm/tools/overpass/api/interpreter>。转换脚本检查多边形闭合、坐标范围、有效高度及内环，输出元数据中的快照、来源指纹和高度统计。公开源或范围变化后应重新检查画面和本说明。
