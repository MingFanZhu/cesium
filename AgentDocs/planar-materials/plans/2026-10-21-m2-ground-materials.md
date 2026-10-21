# M2 贴地面材质

- Plan type: `phase`
- Status: `completed`
- Parent plan: [扩展计划](2026-10-21-planar-materials.md)
- Owner role: architecture / execution（当前任务）
- Architecture review: `confirmed`
- Created / Updated: `2026-10-21`
- ADR: [ADR-0178](../../../Documentation/SceneGIS/Decisions/ADR-0178-planar-materials.md)
- SGP: None。

## Source facts and design

M1 检查点 `4264d02bd0`。Ground 使用自有 z-fail volume + 深度重建的 XY extent，
原生 Primitive 管理共享 VA、BatchTable、Material uniform 与纹理。
Deferred classification 在地表光照后合成预乘 alpha，因此材质直接输出 flat 或 native Phong 结果。

复用现有面积 Shader，以 define 分离 Color 与 Fabric。深度重建的 UV 在裁剪后才应用每对象 stRotation；
normalEC 从表面深度导数取得，TBN 使用平面 XY 投影的切线与法线，保持米制几何。
Stencil pass 不计算材质；pick 使用足迹语义，包含 alpha 为零的材质区域，与原生 GroundPrimitive 一致。
不支持 Fabric 中 discard；该语句会破坏 z-fail 清零约定，应使用 material.alpha。
材质批只合并空间无冲突范围，禁止 Color 分支的同色不透明重叠优化。
内部 Appearance 保持单面命令生成（closed=false），实际 volume cull/depth/stencil 仍由现有 hook 固定。

## Validation

GPU 覆盖 Image/Fabric、旋转、动态 uniform/material、透明叠加与覆盖顺序、孔洞和独立拾取/显隐。
验证无相交批的命令数、warm VA 复用、低视角与地形 envelope 改变；借用材质不销毁。
原有 ground 专项回归；构建、类型与自审完成后独立提交，再进入 M3。

## Results

新增 GPU 3/3、GroundPrimitive 8/8 通过；[自审](../reviews/2026-10-21-m2-ground-materials.md) technical passed。

完整 build、build-ts、tsc 与定向 ESLint 通过。
