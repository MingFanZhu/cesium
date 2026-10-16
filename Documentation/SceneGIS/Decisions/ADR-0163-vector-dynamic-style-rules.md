# ADR-0163：Layer 动态绘制规则

- Status: accepted; D1 frontend and D2 runtime implemented
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

D1 checkpoint 为 `7414056515`；D2 在既有 normal-frame preparation/upload 流程接入公开方法。
每次修改替换一个内部 style record，递增相应 source 内容版本；无关 source 的在途工作仍可发布。
同 source 的旧结果被丢弃后按最新规则准备，但未修改内部层的已发布 batches/candidates 继续复用。
Worker slot 用 Style snapshot identity 同步新配置，不重建线程；初始配置对象也不原地改变。

标注按内部层和整数 zoom 缓存候选，每组保存对应 compiled Style，避免旧 layout 使用新 filter/paint。
发布新组时取消过期 placement iterator；无关组、atlas 和相同 normalized shaping 保留。
background 在下次正常帧替换；首次添加 pattern 时建立 lazy owner，随后按原资源流程请求/上传。
删除 pattern 保留 atlas 供复用，Layer destroy 统一释放。

setter 不请求瓦片、不操作 GPU，也不重建 Layer、Source 或 feature/global state。
隐藏修改在恢复显示后刷新；待请求和在途 Worker、连续修改、销毁后的迟到结果均隔离旧版本。
getter 反映已接受配置，渲染保留最后成功内容到新内容发布。异步失败使用 errorEvent；
`tilesLoaded` 仅反映当前 cover 待处理工作，失败也可能进入无待处理状态，不是成功证明。
规则编辑可让已有原始 MVT 的 preparation failure 再次准备；不添加自动 retry 或静默降级。

每次有效规则变更同步 clone/validate/compile 完整 Style，CPU/内存成本随 Style 大小增长；
受影响的几何内部层重新准备该层批次，symbol 重新准备该层候选。首版不承诺 paint-only GPU subrange、
跨瓦片原子切换或任意大 Style 的固定编辑时延。原始 MVT cache 保留，不等于 Worker 永久保存 decoded tile。
属性变化引入的依赖同时接入现有 feature/global state 失效机制。

配置快照保留原始 source 定义，不序列化 caller-owned source override 实例、show/opacity 或临时 state。
SDK 的 URL 输入可在规则修改后导出内联快照；引擎不改写远端 JSON，不修改 SDK lock。
依赖版本、profile、构建入口不变，生成文件不提交。SDK 升级需要同步主 bundle、Worker 和声明文件，不能混用旧 Worker。
公共交付证据见 [D2 review](../../../AgentDocs/vector-tiles/reviews/2026-10-16-d2-layer-style-runtime.md)。
