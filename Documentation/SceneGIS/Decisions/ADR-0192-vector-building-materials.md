# ADR-0192：MVT 建筑材质

- Status: accepted design; implementation in progress
- Date: 2026-10-27
- Related: ADR-0074、ADR-0075、ADR-0161
- Plan: [building materials](../../../AgentDocs/vector-tiles/plans/2026-10-27-building-materials-extension.md)
- Upstream-owned files / SGP: none planned

## 决定

在现有 vector pipeline 扩展，不新增 Primitive/Entity、瓦片调度、地形请求或几何 pass。
Style root `materials` 是共享材质库，`materialOrigin` 为 source XY 米制原点；
`fill-extrusion-wall-material` / `fill-extrusion-roof-material` 使用既有 string 表达式。
空字符串保留旧材质；未知材质显式报错。MapLibre 官方字段/模块保持原样，自有扩展独立校验。
材质库是 Style 构造快照，动态选择复用 setPaintProperty；不增加运行时图片库修改 API。

每材质支持 baseColor、normal、metallicRoughness、emissive 图片与对应 factors 和米制 repeat。
颜色图片解码 sRGB；法线、粗糙度和金属度为数值。图像 alpha 不增加 cutout/透射语义，
样式/Layer opacity 继续使用现有透明通道。玻璃幕墙是反射外观，不承诺内部/折射。
多个建筑由同一 Layer atlas owner 共享资源；普通 sprite/pattern 保留原所有权。
异步图片/Worker 只发布 CPU 候选，normal render 上传；取消/迟到/销毁必须隔离且释放。

## 坐标与过滤

墙面 canonical tangent 投影消除裁剪 ring 累计起点依赖，屋顶采用固定 XY。
CPU double 减共享原点与整数周期后上传 Float32，Z 使用相对建筑地形锚点的米制高度。
Globe 在显式 materialOrigin 的 3857 纬度固定 meter metric；Planar 直接使用米制轴。
区域尺度畸变、源轮廓简化、ID/属性变化和独立 terrain anchor 仍可能导致变化。
不维护跨 tile 建筑注册表，不猜测无 ID 要素的共同身份。

各材质 mip 单独生成并周期填边，再装入共享 atlas；GPU 手动选择相邻 mip 并插值。
这保留 atlas 合批，避免完整 atlas 自动 mip 的串色；无需 TextureArray 或上游 sampler 改动。
代价为额外材质参数表和每通道两次过滤采样；实际预算由 B2/B3 验证。

## 延迟集成

保留 group -6 及 specular RGB 的三字节 map/style tag，不覆盖排序数据，不新增 G-buffer。
PBR 使用 diffuse alpha 保存 metallic、normal alpha 的带标记 roughness，emission RGB 保存自发光；
emission alpha 继续保存阴影可见度。Legacy vector 编码与光照保持不变。
采用原生 GGX BRDF，借用既有太阳/天空/云影、天空反射与屏幕反射资源，不创建第二套光照。
明确记录反射和透明路径资格，不把近似天空反射称为完整几何 GI。

## 构建、升级与验证

使用已批准 GLSL root、普通 JS barrel 和原 vector Worker entry，不手工改生成物。
复核 native PBR、shared MRT response、style tag、shadow visibility 与 Worker transfer 协议。
公共 API 交付运行完整 build/type/release 及双世界实际 GPU 验证。
