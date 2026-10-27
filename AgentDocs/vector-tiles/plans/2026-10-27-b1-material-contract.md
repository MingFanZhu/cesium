# B1：建筑材质数据与坐标

- Type: phase plan
- Status: completed
- Date: 2026-10-27
- Owner: 当前 Agent，architecture / implementation / self-review
- Architecture review: confirmed
- Parent: [extension](2026-10-27-building-materials-extension.md)
- ADR: ADR-0192；upstream-owned / SGP：预期无

## 源码与方案

`SceneGISVectorTileStyle` 使用 MapLibre specification 校验/编译，Worker 的 tile task
调用 VectorTileGeometry → VectorExtrusionGeometry → VectorBatchGeometry，随后 Globe
适配只改位置/法线。现 pattern 墙面距离从裁剪环起点重置，着色器除以动态 metersPerPixel。
新增专属 materialCoordinate 属性，不改变 pattern 或位置流。

Style root `materials` 保存具名不可变描述，`materialOrigin` 为共享 source XY 原点。
两个 paint string/expression 选择墙/顶材质，空字符串使用原颜色/pattern。
沿用 MapLibre string 表达式及动态 paint invalidation；对 MapLibre 校验剥离自有字段，
自有字段单独严格校验，不修改 vendor/global specification。

所有材质显式声明 `repeat: [width,height]` 米；色彩 RGB 是线性 factor，颜色贴图为 sRGB，
normal 为 OpenGL tangent-space，metallicRoughness 的 G/B 分别为 roughness/metallic。
共享 `materialOrigin` 减少 UV 原点量级；Globe 在此 3857 原点固定 cos(latitude) metric，
用于区域建筑而非全球统一无畸变纹理。Planar 直接使用 World 米制轴。
墙面选择与 winding 无关的 canonical tangent，按原点到墙面的投影定位；屋顶固定 XY。
每条边 CPU double 减整数周期再转 Float32；连续位置的相位不受 ring start、tile/LOD 改变。

Atlas 在原 Worker 增加资源 task，独立生成每材质 mip 并带周期边框，再装入共享四通道图集；
不对普通 sprite 做全图 mip，不发生相邻材质串色。颜色 mip 在线性域平均，法线保留平均长度，
roughness 用平方平均。参数和 mip rectangles 进入共享数值表。

## 步骤与验证

实现 Core helper、Style 入口、几何属性和资源 Worker task；同一批次不按材质拆命令。
Specs 覆盖配置/表达式/非法值/快照、真实米制比例、裁剪和反向边/父子瓦片相位、
atlas mip 的颜色域/边框/normal/roughness 和 transferable。
运行对应 Core Specs、scoped lint/format；记录结果、自审后本地 checkpoint，再进入 B2。
本阶段不宣称渲染 API 已完整可用，不改已提交的 D2 人工 gate。

## 结果

材质专项 9/9 通过，Core 广泛运行与自审结论见 [review](../reviews/2026-10-27-b1-material-contract.md)。本阶段 architecture gate 通过；独立本地提交后进入 B2。无上游文件与 SGP 修改。
