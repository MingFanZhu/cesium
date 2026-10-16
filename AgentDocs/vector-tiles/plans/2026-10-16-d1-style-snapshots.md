# D1：不可变样式快照与候选校验

- Type: phase plan
- Status: completed
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review
- Architecture review: confirmed
- Parent: [dynamic style extension](2026-10-16-dynamic-style-extension.md)
- Related: ADR-0058；upstream-owned / SGP 增量：无

## 源码事实

`SceneGISVectorTileStyle` 已复制输入并冻结 layers/sources，但丢弃根 name/metadata。
`validate` 统一校验 supported profile 与 MapLibre 表达式；`compileLayer` 编译默认值与 filter。
Layer/Worker 已依赖该不可变前端，不应向其添加原地 public setter。
图谱已刷新但符号行号仍对应早期实现，故读取当前文件补足失效信息；调用入口由现有 Layer、Worker 确认。

## 实施

1. 保存完整冻结 JSON，并提供私有独立快照和未求值规则查询。
2. 私有候选构造先校验 layer/scope/property，即使删除未知属性也报错。
3. null 删除原字段；其他值复制并完整验证/编译后返回新 Style，相同规则返回原对象。
4. 复用既有 validate/compile，不复制表达式解释器，不接入 GPU 或资源请求。
5. Core Specs 覆盖隔离、完整 metadata、表达式、默认值恢复、filter 与失败原子性。

## 验证与退出

运行 Style Core Specs 与 scoped 静态检查；本阶段没有公共 API 或 Worker 协议改变。
自审并形成独立本地提交后进入 D2，届时补齐公共 JSDoc/types、运行时和双世界验证。

## 结果

17 项 Core Specs 全部通过；4 项新增测试覆盖完整快照、复制隔离、null/default、错误原子性和表达式。
Architecture 自审通过，见 [review](../reviews/2026-10-16-d1-style-snapshots.md)。
公共 Layer API 尚未接入；完成本阶段独立提交后细化 D2。
