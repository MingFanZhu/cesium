# 透明 Planar 的矢量地表深度与合成

- Type: discussion；Status: resolved；Date: 2026-10-14；Updated: 2026-10-15。
- Author: Architecture / execution 当前任务。
- Parent: [P4e](../plans/2026-10-14-p4e-vector-tiles.md)。
- Related: ADR-0069 / 0072 / 0073、[不透明地图预算](2026-10-14-vector-overlay-budget.md)。

## Reproduced problem

`SceneGISVectorGroundSpec` 的 log / linear 两项旧契约均复现：Layer opacity=0.5、World opacity=0.5 / 0 时，原本应该保留的红色矢量及 feature pick 消失；World opacity=1 正常。

P4d 将 Planar 改为真实透明 / OIT 后，透明地形不再写 opaque depth。Ground coverage 仍借用 `czm_globeDepthTexture`，因此没有实际表面可供逆投影。Globe 已有 native first-surface peel，Planar 没有；不能用后方物体深度冒充地表，不能恢复阻挡地下物体的旧 opaque depth 写入。

## Proposed implementation

1. 仅在透明 Planar 与可见地图覆盖同时存在时，创建一个独立、无颜色附件的 DEPTH24_STENCIL8 目标。每个视锥对当前已发布的地形瓦片增加一次仅深度提交，保留几何、裁剪与 log depth，忽略 World opacity；不执行影像、材质或光照。
2. Ground shader / pick 借用这份实际地表深度；标记继续使用各自原有 anchor / visibility。拾取时按 pick 相机重建同一目标，不额外保留第二张纹理。
3. 复用此前批准的单张 RGBA16F 地图附件预算。在此互斥的透明模式中保存按层序混合的地图颜色；允许必要的透明专用受光。不与 opaque 地图附件同时保留。
4. 最近地表的 OIT 颜色使用 `mapColor + terrainColor * terrainAlpha * (1 - mapAlpha)`，alpha 为 `mapAlpha + terrainAlpha * (1 - mapAlpha)`。因此 World opacity=0 仍可显示地图；远处重叠地表不重复应用近处地图。沿用现有 OIT，不恢复背景快照。
5. 地表范围以外的 circle / symbol 仍在地图原有阶段直接写场景颜色；通过同次 MRT 提交区分地表内 / 外贡献，保留标记越界边缘，避免为标记增加第二次几何提交。
6. 保持 ADR-0072 当前可见地表的独立 alpha 契约；不借此次补齐承诺任意地下 / 背面 / 多层透明对象的精确排序。P4d 的真实透明地形和必要 OIT 路径继续有效。

Scene 仅需一个显式的私有阶段 hook 来取得当前视锥深度，实现在 SceneGIS-owned helper；如落地修改 Scene.js，复用 SGP-0046 并更新 ADR / manifest。无新公共 API。

## Cost to approve

- 新增深度资源：4 bytes / pixel，1280 × 800 为 **3.90625 MiB**；各视锥与 pick 复用同一张，无此组合时释放。
- 地图颜色：使用此前批准的单张 RGBA16F，**7.8125 MiB**，用途扩展为互斥的透明地图合成；不再额外复制一张。
- 新增提交：每个视锥每个可见地形瓦片 **1 次仅深度提交**；pick 同样按需要执行。地图几何和普通对象 **0 次额外提交**，不增加完整地形受光重放或全屏光照。
- 两项合计的透明模式新增资源上限为 **11.71875 MiB / 1280 × 800**。不按视锥数倍增，不降低既有深度精度，不新增设备门槛。

## Required evidence

恢复原 log / linear 独立 alpha 与 feature pick 用例；验证最近地表、World opacity=0、裁剪、前方物体、标记越界边缘、层序、资源切换和释放。实际提交 / 字节计数不能超出上述预算；方案若遇到不能在此范围内保持的契约，先回报具体证据，不能自行扩大预算。

## Decision

2026-10-15 负责人选择“接受按需深度和地形提交预算”，批准上述条件深度纹理、每瓦片每视锥深度提交、拾取时复用，以及地图颜色附件在互斥透明模式的复用。实现须保持预算与 Required evidence，不自动扩展其他场景语义。

## Implementation refinement

逐视锥寻找最近地表会把远段山坡也当作接收面，实际 GPU 用例复现 red=239 而预期 128。实现改为整个视图先取得全局最近地表：每个可见 tile 每次视图只提交一次，仅深度，无材质/受光；各视锥与拾取复用同一纹理，低于已批准提交上限。深度使用可见 tile bounds 限定的独立 log 区间，不跟随 native log/linear 分段编码。原材质/OIT 时序仍逐视锥处理。

整视图与裁剪后的分段光栅化存在浮点插值误差，严格 equality 造成整片地图/文字缺失；GPU 探针观测同面最多八个 DEPTH24 步长的差异，改为带该容差的最近表面深度测试，保留存储格式和普通物体深度。无新增纹理、地图提交或屏幕光照。正交视角的共享边归属对齐窗口光栅规则；pick 使用 ALWAYS 深度测试以真实写入地表深度，避免禁用 depth test 时地下普通对象覆盖 ID。
