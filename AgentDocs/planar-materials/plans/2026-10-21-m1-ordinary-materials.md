# M1 普通面材质

- Plan type: `phase`
- Status: `completed`
- Parent plan: [扩展计划](2026-10-21-planar-materials.md)
- Owner role: architecture / execution（当前任务）
- Architecture review: `confirmed`
- Created / Updated: `2026-10-21`
- ADR: [ADR-0178](../../../Documentation/SceneGIS/Decisions/ADR-0178-planar-materials.md)
- SGP: None。

## Source facts and design

Wrapper 原样传 appearance 给同步 Primitive，但校验拒绝 MaterialAppearance。
Polygon 只输出 position；Box/Cylinder/Ellipsoid 可复用原生 vertexFormat。
Wall/PolylineVolume 已有法线，尚无 UV。Primitive 原生负责 Material.update、uniform 与透明切换，
destroy 不销毁借用 Material。Deferred 原生 MaterialAppearance 已完成资格。

非线 geometry 接纳 BASIC/TEXTURED/ALL，保留旧 Color 配对校验。
按 appearance.vertexFormat 按需生成属性；三种 native volume 直接传原生 factory。
自有 polygon/wall/route surface 使用三角面主轴投影归一 UV，按面分离顶点，
保留已有法线或计算几何法线；ALL 使用原生 tangent/bitangent 计算。
Polygon 新增 finite stRotation，围绕 UV 中心旋转，贴地与 Entity 后续复用。
颜色路径不增加属性或拆顶点；完整坐标仍为 DOUBLE + origin/high-low。

## Validation and completion

- CPU：面朝向、孔洞/挤出、退化侧边、法线/TBN、旋转、大坐标。
- GPU：Image、自定义 Fabric、动态 uniform/material、透明、显隐/pick、外观替换。
- 合批共享 VA/命令，warm 不重建；wrapper 销毁不销毁 Material。
- 原有 Primitive/Core 回归、完整 build/types、自审、独立中文提交。

## Results

新增材质 5/5、Primitive 16/16、Core 126/126 通过；完整 build、build-ts、tsc 通过。
材质分支补充了原生混合状态适配与挤出外法线修正；无 upstream 修改。
[自审](../reviews/2026-10-21-m1-ordinary-materials.md) technical passed，综合视觉验收留 M3。
