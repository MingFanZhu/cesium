# Review: Native planar GeoJSON loading

- Type: architecture/code review
- Status: approved
- Owner / reviewer: current task；未启用独立评审 Agent
- Created / Updated: 2026-10-20
- Target: [standalone plan](../plans/2026-10-20-native-loading.md)
- ADR / SGP: ADR-0172 / SGP-0062

## Findings and disposition

无未解决的产品阻塞项。重点复核：

1. 普通 GeoJSON 的 ECEF/RHUMB、native CRS registry、TopoJSON/parser/style/event 未被替换；
   变更只在显式 planar context 处接入。
2. context 使用实例只读快照，省略配置继承；mode/world/callback 变更在进入 loading、清空或请求前拒绝。
   callback 的 scratch 返回值逐点复制，非有限值及异步结果明确拒绝，失败走 native error/loading 结算。
3. 捕获 World 只供坐标域验证，不拥有 World。异步输入到达时复验 live；门禁按当前 World identity
   验证，enabled clustering 与已有 graphics profile 不放宽。
4. native 2D polygon 的隐式 Globe ground 行为被显式翻译；带 Z 的点/面保留绝对高度。
   Ground/ordinary renderers、资源所有权、深度/拾取、SSE 与批处理均未更改。
5. upstream-owned 文件仅 `packages/engine/Source/DataSources/GeoJsonDataSource.js`；
   SGP-0062 manifest 与 markers 完整，audit 通过，无手改或提交生成物。

## Evidence

相关 Specs 92/92、gate 10/10；开发/release 浏览器 E2E 各 1/1；完整 build/release、
native API 声明与严格 TypeScript 消费、ESLint、patch audit 通过。
本地确定性示例已检查画面，无页面错误。详见 plan 的运行边界与命令。

## Remaining limits and follow-up

- 调用方负责选择投影、处理 CRS 和只把数据源加入绑定的 World；不推断 opaque CRS。
- native load 的部分实体错误语义、并发 load 语义与既有 planar geometry 限制未扩宽。
- 全库 AgentDocs 的既有格式问题留给独立文档维护，本次文件均单独检查。
- 项目负责人可以在 `Test/平面GeoJSON.html` 继续视觉验收。无其他待执行实现阶段。
