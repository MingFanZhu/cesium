# Review: V1 独立数据与样式前端

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审；不是独立评审
- Created: `2026-09-13`
- Updated: `2026-09-13`
- Review target: `feature/vector-tiles` 上 V0 checkpoint `122cd2db2e` 之后的 V1 diff
- Related plan: [V1](../plans/2026-09-12-v1-vector-frontend.md)
- ADR: [ADR-0058](../../../Documentation/SceneGIS/Decisions/ADR-0058-vector-tile-frontend-contract.md)
- SGP: `SGP-0011`

## Scope and summary

四个 SceneGIS/Core 公共入口、镜像 Specs、固定样式依赖和许可证名录、
类型/包交付与 JSON manifest-only 审计修复。
独立解码不导入 Cesium experimental MVT；坐标计算复用 canonical planar matrix，
不把 CRS 标签、terrain LOD 或 style zoom 相互混用。
样式固定 profile 并隔离输入 mutation、依赖对象和 64 位值。

## Findings

| ID     | Severity | Status   | Owner role             | Location               | Finding                                          | Disposition / evidence                                                      | Follow-up                                                                   |
| ------ | -------- | -------- | ---------------------- | ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| V1-R01 | medium   | fixed    | execution              | fixture / source Spec  | 直接取 pooled Writer view 的 buffer 带入无效尾部 | fixture 生成独立 Uint8Array；35/35 Specs 通过                               | 无                                                                          |
| V1-R02 | medium   | fixed    | execution              | 新入口 JSDoc           | experimental tag 缺说明导致类型生成失败          | 补齐说明，完整 build-ts/tsc 和 installed strict TS 消费通过                 | 无                                                                          |
| V1-R03 | medium   | fixed    | architecture/execution | audit-upstream-patches | JSON 被误判为可以加 marker 注释                  | 依据根 AGENTS 加精确 JSON 判断；27/27 回归，修改 JS 的 manifest-only 仍失败 | 无                                                                          |
| V1-R04 | low      | accepted | architecture           | dependencies           | 仓库禁用/忽略 lockfile                           | 顶层固定 24.8.1，保持既有间接依赖解析策略；安装包验证                       | 升级时重跑 profile Specs                                                    |
| V1-R05 | note     | deferred | architecture/execution | rendering              | 计算前端不能证明画面和直接贴地 batch             | 未引入 renderer；V2 明确承担 flat/ground 可行性                             | [Extension V2](../plans/2026-09-12-vector-tiles-extension.md#phase-roadmap) |

## Validation reviewed

- Chrome Headless 152 / Windows：`SceneGISVectorTile` focused Specs **35/35**。
  首次 workspace 使用旧 SpecList 执行 0 项，未计成功；完整 build 刷新后执行新测试。
- 完整 `npm run build`、`npm run build-ts`、`npm run tsc`、`npm run build-release` 通过。
  Types 仍有基线 TSD-JSDoc warnings；四个新入口声明和实际 TS 消费通过。
- 独立 engine tarball 安装后的四个 API，以及 minified release 的 Node CJS 入口通过 smoke；
  独立 consumer strict NodeNext TypeScript 检查通过。
  首次将 browser ESM 文件直接当 Node 模块加载失败；改用发布的 Node CJS 入口，
  没有修改产品或生成文件来绕过环境边界。
- ThirdParty generator 确认样式库 24.8.1 / ISC；生成输出不提交。
- SGP auditor 通过：本次 upstream-owned entries 为 2，生成文件状态为 0；
  auditor 自身回归 **27/27**，包括 JSON 正例与 JavaScript 反例。
- ESLint、修改范围 Prettier、全 AgentDocs Markdownlint 与 diff whitespace 检查通过，
  86 个相对文件链接有效；全目录 Prettier 仍报告 231 个既有格式问题，未扩大修改。

## Accepted risks

MVT checker 不进行完整 polygon topology 修复；unsafe 属性需要调用方明确处理 bigint。
V1 不支持 TileJSON、渲染、Worker、terrain、symbol，不能承诺未实现画面。
地图 batch、过渡接缝、GPU lifecycle 和性能在 V2/V3 资格；字体与 Globe 分别在 V5/G1。
独立安装仅证明本次 npm 解析，不能由无 lockfile 推断长期依赖字节一致。

## Conclusion

V1 implementation gate 通过，保持本阶段独立 checkpoint。
提交后按当时源码建立 V2 phase plan，继续 flat 地图闭环与直接贴地可行性验证。
