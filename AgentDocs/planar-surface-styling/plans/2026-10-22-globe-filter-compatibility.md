# 平面影像滤镜对齐 Globe

- Type: standalone plan; status: completed; created/updated: 2026-10-22.
- Owner/reviewer: current architecture/execution task, self-review.
- Parent: completed Surface Styling S1–S4; ADR-0031 amendment.
- Evidence: [双世界检查](../../rendering-quality/reviews/2026-10-22-material-lighting-audit.md).
- Decision: 项目负责人明确要求以球面现有 Cesium 计算与滤镜/解码顺序为准。
- Upstream-owned changes / SGP: none planned.

## 设计与边界

保留 GlobeFS 的原有行为。Planar 在 raw color-to-alpha 后先选择 gamma 分支，再依次
brightness、contrast、hue、saturation、alpha 混合。无参与层使用非默认 gamma 时调用
`czm_gammaCorrect`；任一参与层 gamma 非默认时，整个 tile command 的所有层仅使用
`pow(rgb, 1/gamma)`。参与条件对齐 GlobeSurfaceTileProvider：已选中 READY 影像且
layer alpha 非零；隐藏、未 ready、无覆盖的层不启用该分支。

只增加每 tile 的一个布尔快照和对应 uniform，复用 normal-render 发布和已有 slots。
不以滤镜值建立 shader variants；保留 depth/pick replay、texture/VA/command 身份及释放。
保留 baseColor / Material / vector 的独立线性输入、世界 opacity 与现有底到顶混合。
Gamma=1 附近的跳变是此次显式接受的 Globe 兼容行为，不再作为修复球面的目标。

## 实施与验证

1. 修订 ADR-0031、Architecture、DevelopmentGuide，记录覆盖旧 Planar 颜色域约定。
2. 将现有实际 GPU 用例改为 Globe 参考结果，先确认旧 Planar 路径失败；补充多层
   gamma 分支、alpha=0/hidden/pending 排除及 normal/depth 快照检查。
3. 修改自有 Surface 发布快照和 shader builder；不复制完整 Globe shader。
4. 运行 Surface/Shader、影像 Widget 与双世界浏览器对照，覆盖五种滤镜、组合、
   raw color-to-alpha、透明混合、HDR/LDR、Material、默认图像和 warm 资源。
   同时修正检查发现的旧混色预期和已由当前添加图层失效语义解释的 readiness 断言。
5. 记录固定场景短帧耗时与分配/命令计数；完整 dev/release build 与类型检查，
   检查两种 bundle 的像素，保存截图在 ignored Build/Specs。
6. 完成 review、handoff 与相关静态检查；只做本次所需修改，不扩展新的光照功能。

## Outcome

实现和技术验证完成，详见 [review](../reviews/2026-10-22-globe-filter-compatibility.md)。
53 Surface/Shader + 12 Widget GPU Specs 通过；dev/release 各 3 个浏览器用例通过，
同输入双世界采样差不超过一个色阶，截图已检查。完整 build、build-release、build-ts、tsc
通过。运行时只改两个自有文件，无 upstream-owned 修改或 SGP；未改变球面和光照默认值。
旧 Widget readiness 预期依据已有 shown-layer 添加失效契约纠正，未修改产品 readiness 行为。
项目负责人视觉反馈待补，未扩展下一阶段。

Scoped ESLint、源码/Specs/本次 AgentDocs Prettier、Markdown lint 与 `git diff --check` 通过。
要求执行的全量 AgentDocs Prettier 仍报告 565 个未改文件；全量 Markdown lint 通过。
Architecture、DevelopmentGuide、ADR-0031 的 Markdown lint 通过，Prettier 告警在 HEAD
版本即存在，保留聚焦差异而不全文件重排。无生成文件进入改动。
