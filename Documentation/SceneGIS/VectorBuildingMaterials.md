# MVT 建筑材质

`SceneGISVectorTileStyle` 的 `materials` 保存共享材质库，墙面和屋顶通过两个 paint 字段独立选择。
适用于 Globe / SCENE3D 和 Planar；不新增瓦片、Worker、Primitive 或拾取接口。

```js
const style = {
  version: 8,
  sources: {
    city: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  // Source XY: EPSG:3857 on Globe; physical world meters on Planar.
  materialOrigin: [-8236050.45, 4975301.25],
  materials: {
    glass: {
      repeat: [3, 3.2],
      baseColorTexture: "/textures/glass-color.jpg",
      normalTexture: "/textures/glass-normal.png",
      metallicRoughnessTexture: "/textures/glass-rm.png",
      roughness: 1,
      metallic: 1,
    },
    brick: {
      repeat: [1.25, 1.25],
      baseColorTexture: "/textures/brick-color.jpg",
      normalTexture: "/textures/brick-normal.png",
      roughness: 0.85,
    },
    roof: { repeat: [2, 2], baseColor: [0.15, 0.17, 0.2], roughness: 0.9 },
  },
  layers: [
    {
      id: "buildings",
      type: "fill-extrusion",
      source: "city",
      "source-layer": "building",
      paint: {
        "fill-extrusion-height": ["get", "render_height"],
        "fill-extrusion-base": ["get", "render_min_height"],
        "fill-extrusion-vertical-gradient": false,
        "fill-extrusion-wall-material": [
          "case",
          [">", ["get", "render_height"], 50],
          "glass",
          "brick",
        ],
        "fill-extrusion-roof-material": "roof",
      },
    },
  ],
};
const layer = scene.primitives.add(
  new Cesium.SceneGISVectorTileLayer({ scene, style }),
);
```

Globe 的 `materialOrigin` 使用 source 的 EPSG:3857 XY；在该原点纬度固定 Mercator → 实际米的比例。
Planar 的 source/world 轴应已是实际米，原点也使用该轴。区域内保持同一个原点，不按瓦片更新。
大区域的固定比例会有纬度误差，应按区域分别配置；它不改变瓦片调度与坐标系。

## 字段

| 字段                       | 默认      | 语义                                                        |
| -------------------------- | --------- | ----------------------------------------------------------- |
| `repeat`                   | 必填      | 一张纹理覆盖的宽、高，正数，单位米；墙面高轴向上，屋顶为 XY |
| `baseColorTexture`         | 白色      | sRGB RGB 颜色                                               |
| `normalTexture`            | 平法线    | OpenGL tangent-space normal，+Y 向上，线性数值              |
| `metallicRoughnessTexture` | G/B 为 1  | G 粗糙度、B 金属度，线性数值；R/A 忽略                      |
| `emissiveTexture`          | 白色      | sRGB RGB 自发光                                             |
| `baseColor`                | `[1,1,1]` | 线性 RGB 乘数，每项 `[0,1]`                                 |
| `roughness`                | `1`       | 感知粗糙度乘数，`[0,1]`；最终着色限制 `[0.04,1]`            |
| `metallic`                 | `0`       | 金属度乘数，`[0,1]`                                         |
| `normalScale`              | `1`       | 法线 XY 乘数，非负                                          |
| `emissive`                 | `[0,0,0]` | 线性 RGB 乘数，非负，允许大于 1                             |

同一材质的所有图片必须尺寸一致；不同材质可以不同。支持普通浏览器可解码图片，外部 URL 需要 CORS。
图片 alpha 忽略；玻璃是有反射的实体幕墙，不含内部、透射或折射。
现有 `fill-extrusion-opacity` / Layer `opacity` 仍可使整栋透明；透明路径不接收屏幕空间反射，且不投建筑阴影。

`fill-extrusion-color` 和 `fill-extrusion-pattern` 保持旧行为。非空材质选择优先于它们，颜色不被旧颜色染色；
`fill-extrusion-vertical-gradient` 仍可调制材质基础色。空字符串选择旧材质；
可用 `layer.setPaintProperty("buildings", "fill-extrusion-wall-material", null)` 移除选择器。
墙/屋顶任一面未选材质时仍走旧分支。

## 稳定选择与生命周期

选择器支持现有 string 表达式，可按属性 `match` / `case`，或稳定的数字 `id` 取模，例如：

```js
layer.setPaintProperty("buildings", "fill-extrusion-wall-material", [
  "case",
  ["==", ["%", ["coalesce", ["id"], 0], 3], 0],
  "glass",
  "brick",
]);
```

使用源数据中跨瓦片、LOD 稳定的 ID/属性；没有 ID 时上例一致落入 glass，不会生成随机身份。
相同直线墙段、固定 roof XY 和物理高度保持纹理相位；源轮廓简化、朝向变化、独立地形 anchor 或 ID/属性变化仍可能形成接缝。
不做楼栋拓扑拼接，不承诺任意 LOD 轮廓之间无跳变。

材质库在构造时复制并冻结；通过 paint 切换已有材质，无纹理热替换接口。
每个 Layer 共享四张图集和一张参数纹理，同 URL 仅请求一次，不按建筑分配纹理或 draw command。
材质 mip 分别生成、周期填边和手动三线性采样；法线 mip 方差提高远景粗糙度以减少闪烁。
多个 Layer 各自拥有资源，不跨 Layer 隐式共享。

`maximumMaterialTextureBytes` 默认 64 MiB，限制完整图集/参数表和已解码源图片；它不是浏览器总峰值内存限制。
图片失败、维度不符、超过预算或未知材质通过 `errorEvent` 报告；失败材质批次不发布，不静默替换成纯色。
`tilesLoaded` 包含材质准备；诊断见 `statistics.materialTextureBytes` 和 `pendingMaterialRequests`。
移除 Layer 释放自有纹理并隔离迟到图片/Worker；天空反射与 BRDF LUT 仍由环境/Scene 持有。

## 光照

材质使用原生 GGX，接入当前太阳、天空、云影和几何阴影；自发光不受阴影衰减。
开启既有 `scene.environmentEffects` 后借用其天空反射。需要附近建筑反射时，显式开启 HDR 和
`SceneGISScreenSpaceReflections`；SSR 只能反射当前屏幕可见内容，缺失方向由天空反射补足。
AO 与 `SceneGISScreenSpaceIndirectLighting` 沿用现有开关与预算。
没有物理环境时保留矢量的简化太阳/环境光，但没有物理天空反射。

实现边界见 [ADR-0192](Decisions/ADR-0192-vector-building-materials.md)。
