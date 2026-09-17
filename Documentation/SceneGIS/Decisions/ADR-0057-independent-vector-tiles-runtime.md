# ADR-0057：独立 Vector Tiles Runtime

- Status: Accepted
- Date: 2026-09-12
- Decision owners: Project Owner、当前 Architecture/Execution Agent
- Related: ADR-0002、ADR-0017、ADR-0018、ADR-0023、ADR-0030
- Related plan: [Vector Tiles](../../../AgentDocs/vector-tiles/plans/2026-09-12-vector-tiles-extension.md)
- Related discussion: [边界讨论](../../../AgentDocs/vector-tiles/discussions/2026-09-12-rendering-boundaries.md)、
  [MapLibre 参考与贴地](../../../AgentDocs/vector-tiles/discussions/2026-09-12-maplibre-reference-and-surface.md)
- Upstream changes / SGP: None

## Context and source facts

Cesium 1.144 的 experimental MVT 链路经 runtime 3D Tiles、MVT decoder、vector GLB、
Buffer collections 和 Globe VectorProvider 绘制。当前实现丢失原生 feature ID/version，
坐标生成绑定全球 Mercator/ECEF，初始化递归创建深层 tileset，
样式也不是 Mapbox Style 前端。它不能作为本扩展的演进基线。

SceneGIS 已有真正的米制平面 World、单根 quadtree、local-origin geometry 与
GPU depth/stencil GroundPrimitive。后者是 single logical instance，尚未证明地图级批量、
重叠 alpha、layer order、复杂线型和逐要素 pick。
用户提供的 MapLibre fork 将 planar coordinate mapping、单根 tile matrix 与 MVT decoding 分离；
其 terrain RTT 路径仅作为比较事实，不作为本项目地形主路线。

项目负责人确认先架构后实现，并同意按 extension plan 分阶段推进；
当前 Agent 可承担架构、执行和自审，阶段提交和人工视觉 gate 继续保留。

## Decision

### Independent frontend and ownership

实现放在 SceneGIS-owned 路径。纯格式、样式计算与数学属于 Core，
GPU 资源属于 Renderer，Scene/World 集成属于 Scene。
不得导入、包装或复制 Cesium experimental MVT decoder/provider/vector GLB/Buffer vector/
VectorProvider 链路。可复用通用 Cesium Core、Renderer、Scene 能力和经过审计的独立工具库。

Source bytes、decoded features、style/layout、paint state、GPU batches 与 symbol placement
有明确的所有权和失效边界。同一 source tile 可供多个 style layers 使用。
公共配置不能暴露将来尚未确定的 Shader/Worker payload。
解码器和样式库选型在 V1 依当前源码确定，必要依赖改动另登记 SGP。

只按视图与有限缓存请求/创建 tiles。不能构造直到 maximum zoom 的完整树，
不能逐 feature Entity 或逐 feature public wrapper 作为地图 batching。
未来 runtime 在 normal frame 发布 GPU 状态；pick/depth 不推进请求、布局或缓存。
Vector readiness 与 World terrain/imagery readiness 分开。

### MVT, identity and coordinates

数据基线为 MVT 2.1，实际能力以版本化矩阵与 fixtures 为准；格式、服务协议、
业务 schema 与样式兼容分别声明。保留 layer version/extent、原生 feature ID、属性、
多部件/孔洞及 tile buffer。64 位值不得经不精确 Number 往返。
业务 identity 与 GPU 局部 index 分开，无原生 ID 时不承诺自动跨 tile 识别同一对象。
畸形 payload、合法空 tile、网络失败和取消不能混为一个成功空结果。

MVT tile-local 整数不依赖 CRS。只接受 level 0 为 `1×1` 的 tile matrix；
level z 为 `2^z × 2^z`，XYZ 从西北起、Y 向南。TMS 只转换 URL row。
应用显式匹配 source matrix 与 World extent/CRS，不自动重投影或重映射异构 matrix。
首轮验收 EPSG:3857，数学从开始适用于已有 SceneGIS 米制 square extent。
保持固定 X east/Y north/Z up、无 wrap、CRS opaque metadata。

Tile-local `(u,v)` 经 layer extent E 映射至 tile bounds：

```text
X = west + u / E * (east - west)
Y = north - v / E * (north - south)
```

World 坐标保留 double 精度；GPU 使用局部坐标与 origin，不直接将完整投影坐标降为 Float32。
Style zoom 是连续相机尺度，source tile level/overzoom 是数据选择；
V1 明确尺度函数，V2 按实际相机固定调用方式。

### Style and symbols

外部格式采用常见 Mapbox Style v8 子集，按 phase 发布准确 profile。
基础结构为 vector sources、source-layer、layer order、filter、min/maxzoom、
visibility 以及 fill/line/circle 的基础 paint/layout。
表达式先支持经过测试的属性、分支与 zoom 计算；unsupported 在样式应用前给出路径诊断。
不将 `version:8` 解释为任意 Mapbox/MapLibre 新能力兼容，
也不静默忽略不支持的 layer/property/operator。

M1 的完整平面目标包含选定样式、直接贴地与基础中文/Latin 点和约定沿线标注。
V2 先验收 flat，V4/V5 分别完成生产贴地与标注；局部阶段成功不等于 M1 完成。
文字需要独立 glyph/font/sprite、placement、碰撞与跨瓦片去重，
不以 LabelCollection pool 代替地图布局。具体资产和细分 profile 在对应 phase 冻结。
完整 SDK、所有 Style v8 属性、复杂国际文字系统、relative extrusion 不在 M1 承诺。

### Direct vector ground and Globe

地形主路线保持矢量直接绘制，排除先合成地图颜色纹理作为主方案。
优先验证 stable vector volumes + depth/stencil 地表着色；
它是候选算法，不是已通过批量资格的既成实现。
V2 提前用最小场景验证不同颜色/alpha 重叠、孔洞、线型、层序、pick 和 command 规模，
不能等完整地图实现后再发现 ground batch 不成立。

现有 single-instance GroundPrimitive 不被本 ADR 自动扩宽，
不恢复 ADR-0023 已删除的 CPU draper；失败也不自动切换 RTT。
若直接贴地候选不满足已确认行为，按实际证据回到架构讨论。
生产 terrain LOD/provider 切换、资源生命周期和画面资格在 V4 完成。

Planar 与 Globe 共享数据、样式语义和适用的调度；曲率、坐标投影、可见性、
terrain attachment 与屏幕标注变换独立适配。
Globe 在 M1 后另行激活 G1，不能用平面画面宣布 Globe 支持。

## Alternatives

拒绝整体修补 native MVT、逐 feature Entity 地图 runtime 和地图颜色 RTT 主路线。
不复制整个 MapLibre Painter/Context；参考的是职责分离及算法。
直接细分并采样地形的 mesh 方案需要新的高程、插值、LOD 和接缝契约，
仅在有实际需求/证据时另作比较，不预先保留第二套 backend。

## Delivery and verification

普通 Source/Specs 使用既有自动 barrel 与 SpecList 构建；生成文件不提交。
新的 Worker、特殊 asset、第三方依赖或上游渲染缝隙在实际进入时另审计，
不借用现有 terrain Worker 例外。

每 phase 独立计划、实现、最小充分验证和 review 后创建本地中文提交，再进入下一阶段。
自动化放在镜像 Specs/E2E；人工场景放在 `Test/vector-tiles/`，
使用根服务器单 ESM runtime，不新建 Sandcastle 页面。
首轮用本地确定性数据；公共 API 验证 build、types 和真实根入口。
用户要求的渲染效果保留人工视觉 gate，性能证据不能代替画面判断。

升级重点复核通用 Renderer/Scene pass、depth/pick、构建和依赖能力，
不跟随 experimental MVT 私有协议。当前决定不修改 upstream-owned files，不产生 SGP。
