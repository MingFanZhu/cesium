# B2 贴地线面实例合批

- Plan type: phase
- Status: completed
- Owner role: execution / architecture
- Created / Updated: 2026-10-19
- Architecture review: 当前任务基于 C11 和原生 ClassificationPrimitive 源码确认
- Parent plan: [批量渲染计划](2026-10-19-planar-batching.md)
- Base checkpoint: `7165674fd6`（B1 独立提交）
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- Discussion / review: None / [B2 review](../reviews/2026-10-19-b2-ground-instances.md)
- SGP: None

## 源码事实

- Ground wrapper 已有标准同步 Primitive 和 queue hook；只接收单实例。
- 其 area/line shader 只输出当前 volume 的颜色，没有原生 Globe ground 的逐片元 footprint/depth 筛选。
  不同颜色 volume 一起写 stencil 后一起着色会相互污染，不能直接合并为一个颜色命令。
- 原生 ClassificationPrimitive 的无 extent picking 路径使用 Primitive 的 `_createPickOffsets` 和
  `_pickOffsets`，共享 VA 后按实例 offset/count 隔离 stencil/color。
- 分类 mask 为 `0x0f`；同色面合并时超过 15 个重叠闭体会产生计数回绕。
- Line previous/next 是局部 FLOAT 点，width 是每 Primitive uniform；多 origin、多 width 不能直接合并。

## 实现

1. Ground 增加静态 geometryInstances 描述数组与按 id 的 attributes/bounds，固定同 geometry kind，保留原单实例 API。
   不增加 modelMatrix、relative ground 或任意 Material；线新增 PolylineColorAppearance。
2. 批次共用 XY origin 与归一化 Z envelope。Line 在 CPU 用 DOUBLE 点差生成局部 incoming/outgoing 方向，
   vertex width 保留每条线尺寸。原生 Primitive 合并这些 Geometry、BatchTable 与 high/low 坐标。
3. 普通渲染与 picking 使用原生 offset/count 范围隔离不同颜色、透明面与线。
   连续相同不透明颜色的 polygon 可合并，单组最多 mask 容量 15 个实例；保持原实例顺序。
   共用一个 Primitive/VA，不承诺所有 ground 对象恒为一个 draw call。
4. 静态 warm 帧保持命令/VA/Shader；native BatchTable 标脏后才重新规划颜色范围。
   单实例/批次 provider envelope 更新只改共享矩阵和 bounds；候选初始化命令采用隔离列表，失败保留 current。
5. 大于 65535 顶点的批次要求 Context 的 uint element index 支持，避免原生 split 后实例 offset 不完整；
   不新增 silent fallback 或重复 renderer。

## 最小充分验证

- 面：不同 origin/颜色、重叠顺序、holes、透明叠加、16+ 同色重叠防回绕，独立 show/color/pick。
- 线：不同 origin/width/color、交叉与倾斜相机、精度与 independent pick。
- 大批量 VA/Primitive/实际 queue command 数；warm identity；provider replacement 不重建；销毁与 candidate rollback。
- 现有 GroundVolume/GroundPrimitive 和 Entity ground 集成回归；dev/release、Shader build、types 与严格 SDK 类型。
- 在已有本地示例增加 ground 对照，记录画面与同机 CPU/资源证据。

## 执行记录

已实现 Ground geometryInstances、共享 origin/envelope、逐实例方向/宽度属性和 native offsets 命令范围。
候选命令列表隔离，失败保留 current；输入快照、same schema、独立属性与 bounds 查询保留单实例兼容。

- Ground 开发与 release Specs 各 18/18；DataSources 集成回归 102/102。
- 8192 个贴地闭体（65536 顶点）共享一个 VA；验证 uint 不可用时在 GPU 创建前拒绝。
  Provider attach/replace/detach 不替换 VA/Shader/命令。
- 32 个同色重叠面正确分成 3 个渲染范围，pick 保持 32 个独立范围；改色后只重新规划范围。
- build/build-release/build-ts、tsc、严格 root/engine SDK 类型通过。
- 本地 1024 对象示例增加 ground area/line 模式；浏览器画面、独立 ID 改色和隔列显隐已检查。
  Ground area 的 Primitive/VA 为 1/1，stencil/color 各 69；line 为 1/1，stencil/color 各 1024。

相对最初目标的明确边界：本阶段没有引入 fragment footprint 筛选，ground 的颜色命令不会全部合成一条。
直接合并异色/透明 closed volumes 会污染覆盖颜色；按原生 offset 隔离是保留现有绘制语义的最小改动。
完整性能、交付与剩余风险见 review。
