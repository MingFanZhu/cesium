# ADR-0163：Layer 动态绘制规则

- Status: accepted design; D1 frontend foundation implemented, D2 runtime pending
- Date: 2026-10-16
- Plan: [动态规则扩展](../../../AgentDocs/vector-tiles/plans/2026-10-16-dynamic-style-extension.md)
- Related: ADR-0058、ADR-0067、ADR-0068、ADR-0076
- Upstream-owned files / SGP: None

## 上下文与决定

SDK 使用 Style v8 JSON 初始化/保存矢量资源，运行时修改属于现有 Layer。
既有 compiled Style 可共享、无资源，不能添加原地修改；重建整个 Layer 会丢失缓存、state 和所有权。
选择同步校验并发布实例独有的不可变候选，再由既有异步渲染管线刷新受影响内容。
Style 保存完整冻结输入，包含 name/metadata；快照和规则查询返回独立 JSON 副本。

Layer API 为 `setPaintProperty(styleLayerId, name, value)`、`setLayoutProperty(styleLayerId, name, value)`、
`setFilter(styleLayerId, filter)`，配套 `getPaintProperty`、`getLayoutProperty`、`getFilter` 和 `getStyle()`。
ID 是内部样式层 ID。只修改已有层的规则，不增加 layer/source/type/root 资源替换能力。
沿用全部已支持表达式与 profile；无效层、属性、值、表达式必须在发布前报 DeveloperError。
校验失败不改变规则或待刷新状态。动态编译是修改时的同步 CPU 成本，不放入每帧路径。

null 删除显式字段，paint/layout 恢复 profile 默认值，filter 恢复不过滤。
undefined 报错；删除未知属性仍报错。getter 返回原始规则，未显式设置时为 undefined，
不返回按 zoom/feature 求值或补齐后的默认值。getStyle 返回完整当前 Style JSON，临时 state 不进入快照。
相同规则是 no-op。成功 setter 返回后 getter 即可读取新值，GPU 内容不承诺同步完成。
已取得的旧 compiled Style 保持不可变；Layer 的 style 属性反映当前版本。

## 实施与升级边界

D1 仅实现私有快照/候选基础；D2 才交付 Layer API、Worker 代际和刷新语义。
数据/资源身份保留，具体更新粒度、当前视图 readiness 和异步失败语义由 D2 依据现有源码补充。
SDK 的 URL 输入可在规则修改后导出内联快照；引擎不改写远端 JSON，不修改 SDK lock。
依赖版本、profile、构建入口不变，生成文件不提交。公共交付需双世界、资源、完整构建和类型验证。
