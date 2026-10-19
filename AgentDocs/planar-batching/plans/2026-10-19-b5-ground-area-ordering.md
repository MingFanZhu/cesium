# B5 非连续贴地面合批

- Plan type: phase
- Status: completed
- Owner role: execution / architecture
- Created / Updated: 2026-10-19
- Architecture review: confirmed，基于 PrimitivePipeline 和 B4 当前实现
- Parent plan: [批量渲染计划](2026-10-19-planar-batching.md)
- Base checkpoint: `c38d1e86a0`
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None
- Review: [B5 review](../reviews/2026-10-19-b5-ground-area-ordering.md)

## 源码事实与设计

B4 仅合并输入中连续且兼容的 index ranges。原生 PrimitivePipeline 先按实例加入 batchId，
再 combine 几何和生成 pick offsets；可在创建内部 Primitive 前重排实例，得到真实连续的索引，
无需复制索引、增加 VA 或引入新的 GPU 资源所有权。

按原输入顺序遍历 polygon XY extents，当前层号为所有此前相交实例的最大层号加一，无相交则为零。
同层 bounds 互不相交，按层顺序绘制保持全部相交对的先后关系（包括传递链），每层保持输入顺序。
用 RBush 查询相交前驱；如果新 extent 完全包含旧 extent，新节点的更高层号及覆盖范围已包含旧约束，
可从树移除旧节点。此精确约束压缩避免完全重叠/嵌套的大批次扫描全部前驱。

仅重排内部 GeometryInstance 数组和 extents，保留公开构造快照及 ID。
Command planner 使用重排后的轻量 ID 列表，避免保留已释放的闭体 geometry buffers。
所有实例都参与排序，包括隐藏和透明实例；属性修改不改变几何顺序，仍可正确显示和改色。
B4 的空间裁剪、同色不透明最多 15 个闭体的 render 合并、生命周期和单实例/line 路径保持。

## 影响路径与 gate

- GroundPrimitive 的 candidate 创建及私有 commands 参数；不改公共 API、Shader 或 upstream-owned files。
- 先复现两个独立重叠栈因不连续范围产生多余命令，再验证 1024 个面（512 个双层栈）缩减为两组。
- 与逐对象基线比较透明叠加、混合不透明覆盖；验证传递重叠链、独立 pick、按 ID 改色/显隐与重建。
- 保持 warm VA/command、释放与 candidate 失败原子性；已有 8192 完全重叠批次覆盖最坏相交输入。
- Ground Specs、必要的 DataSources 回归、开发构建与浏览器画面/命令/CPU 对照；不增加无关验证矩阵。
- 更新 ADR、指南、示例与 review，通过后形成独立本地提交。

## 实施与验证

按计划实施，无额外 Shader、VA 或 upstream 修改。先加入回归测试，在 B4 实现上复现
512 个双层栈的 render/pick 各 513 对命令；修改后各 2 对，像素与逐对象基线一致。
Ground 30/30、DataSources 102/102，开发构建、ESLint 与浏览器检查通过。
重排后独立 ID、显隐/改色、candidate 重建、原生 geometry release 和 warm 资源复用均通过。

浏览器示例增加交错双层透明面；下层、重叠区、上层三处颜色与业务 ID 均和逐对象对照相同，
点击上层 553 改白，隐藏上层后拾取 552，页面错误为零。性能、审查与剩余范围见 review。
保守 XY bbox 相交仍会阻止某些实际不相交轮廓合并；不新增精确 polygon 相交算法。
