# Review: V3B0 自有地图图元

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审；不是独立评审
- Created / Updated: `2026-09-13`
- Review target: `feature/vector-tiles`，V3A checkpoint `ad3ea51f13` 后的 V3B0 工作区
- Related plan: [V3B0](../plans/2026-09-13-v3b0-owned-primitives.md)
- ADR: [ADR-0061](../../../Documentation/SceneGIS/Decisions/ADR-0061-owned-vector-tile-primitives.md)
- SGP: None（本阶段无 upstream-owned 修改）

## Scope and conclusion

地图 batch 改为直接拥有 Buffer、VertexArray、ShaderProgram 与逐要素 pick ID，
移除 Primitive、Appearance、BatchTable 和私有 queue hook。
继续使用 Cesium 通用 Renderer/Scene，不新增 WebGL context、Scene pass、上游 hook 或地图颜色 RTT。
Core 合并与 high/low 编码保持输入 geometry 不变，Scene batch 继续维护层序与独立 region clipping。

按项目负责人提醒复核 DerivedCommand：基础命令设置 pickId，颜色和拾取提交同一 region command；
Cesium 自动派生 pick Shader/render state。自有顶点与 fragment 显式声明 pick varying，
原有 coverage/clip/discard 参与拾取。无需另外维护手工 pick command。

## Findings

| ID       | Severity   | Status   | Owner role             | Finding / evidence                                                                   | Disposition / follow-up                                                                                     |
| -------- | ---------- | -------- | ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| V3B0-R01 | high       | fixed    | execution              | 移除 Primitive 注入后，首次真实 pick Shader 编译报告 v_pickColor 未声明              | 自有 FS 显式声明条件 varying；原 67 项行为测试未放宽，最终 71/71 通过                                       |
| V3B0-R02 | medium     | fixed    | architecture/execution | 分步 GPU allocation 与延迟 Shader 编译必须在 publication 前拥有失败清理责任          | 显式 Buffer/VA ownership 转移、Shader bind 预检；index allocation 与 compile failure 的真实资源销毁测试通过 |
| V3B0-R03 | medium     | fixed    | architecture/execution | 旧 batch 另建 pick region clones，重复承担 Cesium 已有派生职责                       | 由 DrawCommand.pickId 自动派生；真实 Scene pick 检查共享 VA/uniformMap、关闭 blending、warm 派生命令复用    |
| V3B0-R04 | limitation | deferred | architecture/execution | butt/miter 暂借用纯 CPU PolylineGeometry 与 PolylineCommon 数学，尚非完全自有 stroke | ADR-0061 记录来源、基线及同步条件；由 [roadmap](../plans/2026-09-12-vector-tiles-extension.md) 的 V3B1 替换 |

## Validation reviewed

- Chrome Headless 152 / Windows：focused Specs **71/71**；保留全部 67 项既有测试，
  新增 4 项 Renderer 资源测试。覆盖同 feature multipart 共享 pick ID、释放 pick 映射、
  borrowed geometry 不变、32-bit indices、禁用 pick 不分配 ID、分配/编译失败回滚。
  首轮新增测试误传 Color 对象给当前使用整数 key 的 getObjectByPickColor；
  按源码改为 color.toRgba()，未修改产品 API。
- Chromium 151 / Windows：本地页面 E2E **2/2**，无页面异常；
  保留颜色、真实 PBF、拾取、倾斜、requestRenderMode、显隐、重建、父子分块替换。
- 对照本阶段开始前保留的 V3A 截图检查全图、倾斜与 mixed LOD：
  未观察到地图画面变化；mixed LOD 原有量化边缘保持。
  本阶段延用项目负责人已通过的 V3A 视觉基线，不声称新增一次负责人验收。
- Engine/root build、build-ts、tsc 通过；类型生成保留既有 TSD-JSDoc warnings。
  Build-release、独立 engine tarball 安装、5 个公开入口、4 个固定生成 Shader、
  320-feature PBF 解码、strict NodeNext TypeScript 与 minified release CJS smoke 通过。
- 修改范围 ESLint/Prettier、Markdownlint、相对链接与 diff whitespace 检查通过。
  全 AgentDocs Prettier 报告 233 份本阶段未修改的既有文档格式问题；
  本阶段新增/修改文档单独检查通过，不格式化无关文件。
  上游审计通过：当前交付 upstream-owned entries **0**，generated status **0**。

## Performance evidence and limits

Intel Core i5-12490F / Windows / Chromium 151.0.7922.34，1280×800、DPR=1，
同一开发 ESM 与本地 320-feature 城市。中央街区 60 warm frames 的 CPU 提交
median **0.7 ms**、P95 **1.3 ms**；4 desired / 5 resident / 25 draw commands。
V3A 两个样本为 median 0.9/1.1 ms、P95 1.3/1.8 ms；此次 firstReady 约 231 ms，
V3A 为 207/190 ms。短样本和首次编译有波动，不据此宣称稳定加速或密集地图性能。
未增加 command 数，warm 不重复上传，资源身份与销毁由 Specs 验证。
GPU 完成、浏览器合成、密集 payload 与 Worker 的资格仍属于 V3C。

## Gate and handoff

渲染、资源、release/package 与范围验证通过，本阶段自审关闭并形成独立本地提交。
随后再细化 V3B1 线型/AA，保留生产 terrain、symbol 与 Globe 的独立阶段边界。
没有新增 upstream-owned 文件或 SGP。

后继状态：V3B0 checkpoint 为 `d2667e6ad4`。V3B0-R04 的临时线数学依赖已由
[V3B1 review](2026-09-13-v3b1-style-primitives-review.md) 记录解决；上表保留本阶段交付时的状态。
