# 极端视角缩放范围与锚点开销评审

- Type: review
- Status: approved；负责人视觉验收通过
- Created / updated: 2026-10-20
- Owner: 当前 Agent，Architecture / implementation self-review；非独立评审
- Target: [standalone plan](../plans/2026-10-20-implicit-zoom-bounds.md)
- Related: ADR-0058、ADR-0067；upstream-owned files / SGP 增量：无

## Findings

- P1 / fixed：四处缺省范围判断均将未声明上下限的层排除在 `[0,24)` 外。
  现在上下限独立缺省为无界，显式下限包含、上限排除；快照不写入 Infinity。
  Core / GPU 提交与拾取 / Symbols 跨越 0、24 并往返，原始 zoom 与米/像素保持。
- P1 / fixed：开放极近视角后，Worker 预展开百万级重复线锚点，2 块瓦片 postMessage 内存失败。
  共享路径的分段等差范围替代预展开；仅在已有 placement budget 中展开通过包围体剔除的候选。
  真实 Worker 测试用不足 10 KB 的 label 表达超过一亿个虚拟锚点；极近平面测试仅生成屏幕内
  1 个候选，平移往返仍可拾取，GPU 资源在移除后释放。
- P1 / fixed：直接以端点 ECEF 盒裁剪会漏掉球面曲率及起伏高度。
  使用原生 rectangle OBB + 已有高度范围，测试覆盖跨半球、高纬、微小线段及 −500～9000 米高程。
  共享线顶点与原 station 索引保持，不修改 SSE、字形大小或 spacing。
- P2 / deferred：旧 `derivedCommands.picking.pickCommand` 测试路径仍失败。
  [D2 review](2026-10-16-d2-layer-style-runtime.md) 已通过旧运行时对照确认同一问题。
  本项不改派生渲染管线；由后续独立回归维护处理。
- P2 / deferred：新增测试探索中，极窄正交视锥的普通面/圆颜色读回为黑，但原范围内 23.5 同样复现，
  提交命令和拾取正确。该像素问题尚未单独定位；缩放范围测试明确断言真实 GPU 提交、拾取、缓存
  与释放，不宣称这类特殊正交像素路径已修复。后续正交渲染维护需针对该 fixture 单独复现；
  本次画面验收依据实际两世界示例及负责人确认。

## 验证

Chrome Headless 155，真实 WebGL / TaskProcessor Worker：

- Core Style / Worker / SymbolLine、Scene Layer / Symbols / Globe：152 项，151 通过、上述 1 项既有失败。
  本次新增 6 项均通过，原近景尺寸、倾斜透视、孔洞、透明叠加、地形与拾取回归保留。
- 首轮较宽 vector 回归 300 项为 283 通过、17 失败，包含两个随后处理的新增 fixture 失败，
  其余错误类型身份、旧颜色 fixture、资源与派生拾取问题在 D2 记录范围内；不宣称全部 vector 测试通过。
- 开发构建重新生成主 bundle、Specs、Worker；无新公共类型、依赖、Shader 或构建入口。
- scoped ESLint / Prettier、diff check 与全部 AgentDocs Markdownlint 通过。
  全量 AgentDocs Prettier 仍有 450 个未修改历史文件警告；本次修改文档单独格式检查通过。

## 原页面与开销证据

综合环境原相机、时钟与图层设置恢复后：

| 场景                             | 原始 style zoom | 渲染瓦片 | 绘制命令 | 结果                                             |
| -------------------------------- | --------------- | -------- | -------- | ------------------------------------------------ |
| 平面，高空、相机在 extent 外     | −0.1793681354   | 4        | 22       | 恢复绘制，20 标注；已有复杂文字/缺字报告独立保留 |
| 球面，离地约 2.339 米、仰视约 5° | 24.55300879     | 14       | 587      | 恢复线面与建筑；0 请求/Worker 失败               |

球面 metersPerPixel 仍为 0.0031798865，SSE 仍选择 level 12–14；平面仍为 88633.7124、level 1。
球面约 1,659,932 个重复锚点改为 14,939 段范围，另有 4,107 个普通点/中心锚点；当前视角内没有
通过既有可见性条件的标注，重复锚点实际展开为 0。改动不保证所有视角文字都可见，仍遵守深度、遮挡
和资源 profile。Worker 总耗时受测试并发影响，且失败前后完成瓦片数不同，不据此声称 CPU 固定加速比。

平面 97 帧连续缩放往返经过 zoom 0，命令数最低 22、失败瓦片始终 0，最终恢复原视角。
球面当前视角已验证；负责人随后确认“我已检查通过”，停止继续操作已验收页面。
球面原视角的连续相机缩放未另补录，0/24 往返边界由自动化真实 GPU / Worker fixture 覆盖。
真实网络的复杂文字 shaping / 缺字失败仍单独显示，未静默隐藏或用它们解释整层停绘。

## 所有权与交付

全部改动为 SceneGIS-owned。Upstream-owned files：无；SGP：无；生成文件不提交。
没有修改用户既有环境/相机实现；2026-10-20 按负责人后续要求独立提交，未推送。
负责人视觉 gate 已关闭，D2 动态规则 gate 独立保留。
