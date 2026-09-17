# E2：上手示例矢量透明度

- Type: `phase plan`
- Status: `completed — owner progression accepted`
- Owner: 当前 Agent，architecture/execution 自审
- Architecture review: `confirmed`
- Updated: `2026-09-14`
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Predecessor: G3 checkpoint `1e84903262`
- ADR/SGP: None；复用现有公共 API，仅修改 SceneGIS-owned 示例与验证
- Review: [E2 自审](../reviews/2026-09-14-e2-example-opacity-gui-review.md)

## Scope and implementation

负责人要求把矢量不透明度放入示例，GUI 使用 lil-gui。
两个中文上手页各自包含完整初始化；Test/lib 已有原始 lil-gui 0.21.0 及 MIT 许可。

1. 平面、球面示例各自导入本地 lil-gui，直接绑定 Layer.opacity，范围 0..1，默认 1，中文标签。
2. 按负责人修正，说明卡片与控制面板分为两块，纵向排列在左上角；保留 lil-gui 默认样式，避免遮挡右上角原生 FPS。
3. pagehide 保留 BFCache；实际离开时销毁 GUI 与 Viewer，异步加载不复活已销毁页面。
4. 更新上手说明与本地库使用登记；不修改 vendored 库或产品 runtime。

## Verification and gate

只运行现有上手示例 E2E，补充 GUI 的实时 opacity 修改、零透明不可拾取、恢复显示及 BFCache/销毁检查。
修改范围 lint/format、AgentDocs 文档 gate；实际页面视觉检查。
技术自审后交付，不重新运行无关 engine/build/release。验收后独立 checkpoint。

## Delivery

两个中文上手示例已接入本地 lil-gui，默认 1，步长 .01；文档与库使用登记同步。
3 项既有 E2E 通过，覆盖实时 opacity、不可见时的拾取、恢复、BFCache 和实际离开后的销毁。
内置浏览器确认双世界公开地图正常，平面 .5 效果可见并恢复为 1。
按负责人后续修正，移除全部 lil-gui 主题覆盖；说明卡片与默认深色 GUI 独立分块，实际页面检查通过。
修改范围 ESLint/Prettier、全 AgentDocs Markdownlint 和 diff whitespace 通过。
全 AgentDocs Prettier 保留 233 个既有文件告警；本阶段修改的文档通过，未改动无关历史文件。
本阶段不修改产品实现或上游文件，无新增 SGP；技术自审通过。2026-09-17 负责人要求推进建筑拉伸，按推进授权关闭 E2 gate，先形成独立 checkpoint。
