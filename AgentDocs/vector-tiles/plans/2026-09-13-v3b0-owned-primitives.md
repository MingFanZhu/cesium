# Phase Plan: V3B0 自有地图图元

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Phase: `V3B0`
- Owner / reviewer role: 当前 architecture/execution Agent，自审
- Architecture review: `confirmed`
- Created / Updated: `2026-09-13`
- Entry checkpoint: `ad3ea51f13`（V3A，项目负责人验收通过）
- Related review: [V3B0](../reviews/2026-09-13-v3b0-owned-primitives-review.md)
- ADR: [ADR-0061](../../../Documentation/SceneGIS/Decisions/ADR-0061-owned-vector-tile-primitives.md)
- SGP: None

## Objective and source facts

按项目负责人明确的自有图元方向，将 V3A batch 的 GPU ownership 从 native Primitive/Appearance
迁到自有 Renderer resources + Scene command publication；保持已验收画面及兼容 profile。
V3B0 与后续 V3B1 线型/AA 分开形成 checkpoint，使资源迁移和风格变化可分别回退与验证。

- 已审计 PrimitivePipeline.geometryPipeline：合并实例、DOUBLE attributes high/low 编码、
  index capacity split 均可使用 Core helpers，不需要 Primitive 的 World/BatchTable/queue 生命周期。
- VertexArray.fromGeometry 本身不提供逐步分配失败的完整事务清理；
  自有 helper 显式创建 Buffer/VA 并在 ownership 移交前保留清理责任。
- ShaderProgram.fromCache 延迟编译；candidate 必须实际 bind/compile 后再发布。
- 自有 SceneGIS atmosphere Renderer 已用 Buffer/VA/ShaderProgram/DrawCommand 与 same-context ownership。
- 当前 layer 本就维护 style order、batch publication、source/cache 与 region；
  移除 native queue hook 不需要新增 Scene pass 或上游缝隙。
- MapLibre 参考的连续 stroke/coverage 属于 V3B1；V3B0 仅保留已验收的线几何/近裁剪数学桥接。

## Implementation

1. Renderer private resource owner 接收当前 prepared Geometry 数据，复制 descriptor，
   合并 feature color/pick color 属性，编码 DOUBLE positions；输入数据不被编码过程改写。
2. 显式创建 buffers/VA、Shader 与 pick IDs；candidate 失败时清理，warm frames 不重复创建。
   allowPicking=false 不建立 pick 通道；index capacity 保留既有 Core split 语义。
3. Scene batch 移除 Primitive/Appearance/BatchTable/hook，创建本批基础 DrawCommand；
   保留 region clones、层序、premultiplied alpha 与 depth replay。
   同一 region command 设置 pickId 并由 Cesium 自动派生 pick Shader/render state，
   不额外维护手工 pick command。
4. 固定自有 flat/circle/兼容 line vertex Shader 直接消费 RTE 与顶点颜色；
   兼容线的来源与未来移除条件按 ADR-0061 记录，生成 JS 不编辑。
5. Specs 的私有生命周期断言迁到实际资源 owner，保留原像素/交互预期；
   增加实际资源失败与销毁验证，页面 E2E/截图和性能对比 V3A。

## Exit and limits

67 项既有 focused Specs 的行为预期保持；新增 resource tests、2 项页面 E2E、
构建/类型/release/独立安装包、上游与生成文件审计通过。
视觉基线为项目负责人已通过的 V3A flat 与逐块替换；资源迁移不同时改变画风。
若出现可见差异，必须记录原因并交项目负责人判断，不能扩大容差掩盖回归。
自审关闭后独立 checkpoint，再细化 V3B1 的 stroke/AA 实现。

本阶段不承诺新线型、虚线、fill fringe、生产贴地、symbol 或 Globe；
PolylineGeometry/PolylineCommon 桥接仍是已知临时依赖，必须由 V3B1 处理。

## Implementation and handoff

自有 resources、固定 vertex Shader 与基础/region DrawCommand 已接入，移除原生 Primitive
与 Appearance lifecycle；颜色、坐标、层序、coverage 和请求预算保持。
按项目负责人提醒删除冗余手工 pick clones，复用 Scene/DerivedCommand；
真实拾取回归确认 Shader varying、裁剪、资源共享与派生缓存。

71 项 focused Specs、2 项页面 E2E、build/build-ts/tsc/release、独立安装包通过。
V3A 全图、倾斜与 mixed LOD 截图对照未观察到可见变化，保持已批准视觉基线。
资源分配失败回滚、pick ID 释放、大 index 与 warm replay 有真实 Context 证据。
详细性能、处置与剩余风险见 review；无 upstream-owned 或生成文件改动。
实现和自审关闭后由 Architecture Agent 建立独立本地提交，再进入 V3B1。
