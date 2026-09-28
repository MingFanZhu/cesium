# Bistro 街区验收数据

当前 `PBR综合验收.html` 默认加载 Bistro。`?asset=sponza` 保留之前的材质矩阵、
头盔、玻璃样本和水池。两者共用物理大气、A/B 控制和标准 GIS 相机操作。

## 来源和交付边界

- 原始资源：[Amazon Lumberyard Bistro / ORCA](https://developer.nvidia.com/orca/amazon-lumberyard-bistro)，
  Amazon Lumberyard，2017，CC BY 4.0；本次使用用户提供的 v5.2 原始资料。
- 几何输入：用户用 Blender 转换的 `Test/Data/Models/Bistro.glb`，2,829,226 三角面、
  1,591 primitives、132 材质。它不是未经修改的官方 FBX 几何基准；ORCA 标称外景
  2,832,120 三角面。保留输入节点、变换、几何字节、法线和 UV，不重建几何。
- 原始 GLB、FBX、DDS 均不覆盖、不提交 Git。网页加载独立的
  `local/bistro/Bistro.gltf`；源版本及转换记录由 `prepared.json` 保存。
- 默认最大纹理边长 1024，RGBA8 含 mipmaps 估计约 1.17 GiB；源 GLB 的 2K
  纹理估计约 4.67 GiB。1K 是明确的网页交付派生版，不是原始纹理画质。
  Bistro 当前只有这个交付版本，旧 Sponza URL 的 `textures=2k` 不改变它。

## 材质恢复

原 GLB 的所有材质均为 BLEND、金属度 1、粗糙度约 0.553，没有 ORM 纹理。
原始 README 明确规定 `Specular.dds` 的 R/G/B 分别是 AO、粗糙度和金属度，
不是普通高光颜色。准备脚本用原始纹理重建 glTF metallic-roughness，
移除误接的 `KHR_materials_specular`；DirectX 法线翻转绿色通道后用于 glTF。
转换在原始数值通道上进行，不应用显示色调映射。

2026-09-28 校准发现 131 张源 ORM 的 R 通道全零，源 Falcor 对此槽位标为
unsupported；它不能作为 glTF 的有效 AO 绑定，现已移除这些 `occlusionTexture`。
保留原始 ORM 字节及 G/B 数值，125 张粗糙度近似常数 0.741 的源特征也保留。
复现及独立 Cycles 对照见 [画质校准记录](Calibration.md)。

120 个完全不透明材质使用 OPAQUE，7 个植被或源命名 MASKED 材质使用 MASK
（阈值 0.5），5 个其余带透明度材质保留 BLEND。保留原有双面属性与自发光。
`Paris_LiquorBottle_01_Labels` 没有源 ORM，明确使用非金属、粗糙度 1 的纸标签
假设；其源 alpha 全零，未擅自使其可见。玻璃遵循源 alpha，不新增 transmission、
折射或体积吸收。街区不含新水面，原水池保留在 Sponza 样本中。

当前世界位置/缩放沿用用户 GLB，球面放在同一局部 ENU frame。太阳和环境来自
示例控制器，不导入 FBX 的分析灯光、相机或原始 HDR。无局部 GI / 探针。

## 本地准备

使用 Blender 4.3.2（含 DDS 解码与 numpy），在仓库根运行；将路径变量换为实际位置：

```powershell
$blender = '<Blender 安装目录>/blender.exe'
$bistroSource = '<Bistro_v5_2 解压目录>'
& $blender --background --factory-startup --python-exit-code 1 `
  --python scripts/scenegis/prepare-bistro.py -- `
  Test/Data/Models/Bistro.glb $bistroSource `
  Test/Rendering/pbr-data/local/bistro 1024
```

输出包含独立 glTF、重排的几何 buffer、PNG、源许可/README/CHANGELOG 和转换
报告。DDS 按材质名及已确认的 Blender `.001` / `.DoubleSided` 后缀映射；未解释的
缺失纹理直接报错。更换源资产后需重新准备并检查固定视角；不自动猜测来源或修材质。
