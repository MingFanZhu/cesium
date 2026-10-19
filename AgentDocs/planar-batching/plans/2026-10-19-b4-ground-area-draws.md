# B4 贴地面 draw call 合批

- Plan type: phase
- Status: completed
- Owner role: execution / architecture
- Created / Updated: 2026-10-19
- Architecture review: confirmed，基于 GroundPrimitive / ClassificationPrimitive / ShadowVolumeAppearance 源码
- Parent plan: [批量渲染计划](2026-10-19-planar-batching.md)
- Base checkpoint: `bcfde86bf9`
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None
- Review: [B4 review](../reviews/2026-10-19-b4-ground-area-draws.md)

## 源码事实与设计

原生 ClassificationPrimitive 的 color / extent pick 路径每 VA 两条命令（stencil + fill）。
GroundPrimitive 提供各实例 extents，ShadowVolumeAppearanceFS 从 globe depth 重建地表位置，裁剪实例范围；
没有 extents 的 pick 才使用逐实例 offsets。仅把旧命令范围合并会在倾斜视角下串色和串 ID。

Planar 保留 closed-volume stencil 精确轮廓（含凹形/孔洞），增加原生同类的 XY extent 片元裁剪。
Stencil pass 不裁剪；color/pick pass 用已有 globe-depth copy，不新增 texture、Scene pass 或 terrain 查询。
CPU DOUBLE 计算 extent 和各顶点相对 offset，再交给 FLOAT attribute；位置继续原生 high/low。

按输入顺序、VA 和 XY extent 组织连续范围，用已有 rbush 依赖检测范围内部相交；
范围内部互不相交的异色/透明面合成一次 stencil 和一次 fill，pick 使用相同空间分组。
相交实例不能任意合成 union，否则破坏透明叠加、孔洞及后绘制覆盖契约；保留有序分组。
原有同色不透明且最多 15 个闭体的 render 合并保留，pick 仍按空间范围隔离。
拓扑不变时空间信息固定，颜色改变仅重算 render 分组，warm 不逐对象扫描。

## 影响与验证 gate

- 修改 ground volume / area GLSL / commands / wrapper；保留公开实例 API、uint guard 与 candidate/current 生命周期。
- 1024 个异色面、透明面：颜色和拾取各两条业务命令；独立 ID/color/show，warm VA/command 保持。
- 倾斜视角和宽高度包络下投影重叠不串色；凹面、孔洞、相邻边、真实重叠、透明叠加与 32 层 stencil wrap 回归。
- Linear/log depth、低视角、真实坡面和 provider envelope 更新；缺 depth texture 时两种 geometry 均提前拒绝。
- Ground 与 DataSources 最小充分回归；dev/release build、类型、npm shader 交付与浏览器计数/画面/CPU 对照。
- 更新 ADR、指南与 review，通过后独立本地提交；不改上游。

## 实施偏差与证据

倾斜孔洞测试暴露既有 volume builder 对内外环使用相同侧壁法线方向，单对象也误填孔洞。
新增单对象四种内外环绕序组合，修复前均复现颜色/拾取错误；按 ring role 反转孔洞壁后通过。
面积方向改用相对首点的 DOUBLE 差值，避免大世界坐标乘积抵消。此修正仍在既有 volume 模块内。

Ground 开发/release 各 27/27、DataSources 102/102；1024 异色面 render/pick 各两条命令，
浏览器独立改色/隐藏/拾取、CPU 对照与画面检查完成。完整构建、types/tsc、engine tarball 和 review 通过。
无上游修改，剩余重叠/包围范围保守分组边界见 review；本阶段形成独立本地提交。
