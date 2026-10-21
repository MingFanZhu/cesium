# M2 自审

- Status: technical passed
- Reviewer role: architecture / execution（当前任务自审）
- Date: 2026-10-21
- Scope: Ground Fabric、共享命令与 Shader

## Findings

- M2-01（high，resolved）：材质不能使用同色 opaque overlap 快路径，已关闭；
  128 不相交对象保持一个 stencil/color pair，重叠批与独立绘制像素一致，最后对象独立拾取。
- M2-02（high，resolved）：Stencil pass 不求值材质，alpha=0 仍清模板；pick 采用原生 ground 足迹语义。
  明确拒绝 discard，使用 alpha 替代；材质替换时同步检查。
- M2-03（medium，resolved）：共享 Primitive closed + translucent 会产生双源命令；
  内部 Appearance closed=false，实际 volume render state 仍由既有 hook 提供。
- M2-04（medium，resolved）：动态 material 更换同步 native uniformMap，独立 pick map 也重建。

## Evidence and limits

新增 GPU 3/3 通过：Image 两侧颜色、透明像素足迹 pick、动态 uniform 与材质、
128 对象 VA/命令复用、透明重叠顺序、显隐、地形 provider 更换、60/30/10 度倾角。
原有 GroundPrimitive 8/8 通过。测试使用固定光源和非黑 Checkerboard，避免把黑格误判为缺绘制。
Color 分支保留；无 upstream-owned 修改、无 SGP。
材质 normalEC 使用深度导数，边界处与其他深度重建效果一样存在像素尺度误差。
综合示例与项目负责人视觉验收在 M3。

完整 build、build-ts、tsc 与定向 ESLint 通过。
