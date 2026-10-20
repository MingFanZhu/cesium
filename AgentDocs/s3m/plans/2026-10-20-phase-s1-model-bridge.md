# Phase Plan: S1 decoder and Model bridge

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [S3M loading](2026-10-20-s3m-loading.md)
- Phase: S1
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: 当前任务自检
- Created / Updated: `2026-10-20`
- Related discussion: [集成边界](../discussions/2026-10-20-loading-boundaries.md)
- Related review: [S1 review](../reviews/2026-10-20-s1-review.md)
- ADR: [ADR-0174](../../../Documentation/SceneGIS/Decisions/ADR-0174-s3m-model-loading.md)
- SGP: None

## Source facts and design

- 原生 Model.fromGltfAsync 接受内存 GLB，负责 GPU 资源、材质、延迟光照和拾取。
- EXT_mesh_features / EXT_instance_features 与结构化属性可保留 S3M 对象 ID。
- 官方 Shader 明确只返回首张纹理，第二张乘法被注释；本轮遵守其实际启用语义，
  不擅自将第二张纹理解释为 AO 或额外照明。
- 17-float 实例包含行式 3x4 变换、颜色和编码对象 ID；转换为原生 GPU instancing。
- 复用并裁剪官方 S3M 1.0 解码布局；去除全局 Cesium、Draco 初始化和未资格分支。
- DXT 在 Worker 转为 PNG 后嵌入 GLB，使纹理完全由原生加载器所有；不创建外部
  blob URL 或自定义 GPU texture cache。源解码器的 RGBA 行偏移问题单独修正并测试。
- 每个 PageLOD 产生独立 GLB，保留 geode transforms，便于后续按页原子替换。

## Affected paths and validation

SceneGIS Core 私有 parser / converter / task，精确 owned Worker entry，
SceneGIS Specs、本地 Test 数据及来源说明；不修改上游文件。

验证二进制版本拒绝、几何 / 材质 / feature metadata、实例变换、DXT 首末行、
Worker transfer 和真实 GPU 编译 / 拾取 / 销毁。执行完整构建以确认 Worker
交付；性能仅作同机诊断。完成 review 和本地提交后才激活 S2。

## Results

- 完整 `npm run build` 通过，自动发现并输出 Worker，无构建入口补丁。
- 定向 Specs 4/4，通过格式拒绝、DXT 首末行 / alpha / 边界块和浏览器 PNG 解码。
- Chromium E2E 2/2：真实精模与 859-instance 文件经过 Worker transfer、
  原生 Model 绘制、原始对象 ID 拾取、销毁。确认截图纹理 / 实例分布。
- Node 实测转换官方仓库全部 9 文件及晋江根瓦片成功；单次约 0.4–110 ms，
  仅作本机诊断。晋江 GPU / 双 World / LOD 留在 S2 完整图层验收。
- 修正桥接测试的内存 GLB cache identity：每页需独立 basePath，S2 必须保留。
- `eslint` 对所有新增 JavaScript 通过；未修改 upstream-owned files，SGP 无。
