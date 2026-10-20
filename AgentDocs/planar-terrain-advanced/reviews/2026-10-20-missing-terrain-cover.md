# 缺失子级地形连续覆盖技术自审

- Type: review
- Status: approved（技术自审；负责人原场景复测待定）
- Created / Updated: 2026-10-20
- Owner / reviewer: 当前 Agent
- Review target: [维护计划](../plans/2026-10-20-missing-terrain-cover.md)、Terrain runtime、Terrain / Surface Specs、ADR-0009 澄清
- Upstream-owned files / SGP: None

## Findings 与处置

| ID        | Severity | Status | 事实与处置                                                                                                                                                                                                                       |
| --------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COVER-R01 | major    | fixed  | 连续缺失子级的 direct state 均为 terminal，但中间父级尚无 active terrain，后代却提前发布 FLAT。现在只继承父级已 READY 的 terminal FLAT；其余等待直接父级 terrain data，继续由已有祖先覆盖。CPU 与两种地形格式 GPU 失败回归通过。 |
| COVER-R02 | major    | fixed  | direct terminal 时将等待 fallback 的 selection bounds 收紧至 Z=0。现在必须有 READY active fallback 才收紧；等待或刷新保持 provider 保守范围。新增 bounds 回归通过。                                                              |

## 源码与边界审计

- 对照 `GlobeSurfaceTile.upsample`：直接父级 terrainData 不存在时等待；
  `QuadtreePrimitive` 的 renderable 门禁保留祖先覆盖。
- 平面沿用自己的四子接替和坐标语义，未复制球面遍历。修复只改变两个常数时间条件，
  无新增扫描、队列、网络请求、Worker、GPU 资源或 Shader 分支。
- 保留正常 direct 优先、已有 fallback 刷新、root pending FLAT、
  已确认 root 不可用时的稳定 FLAT，以及无 provider 的平面路径。
- fallback 等待时使用 provider 高度范围可能比错误的 Z=0 包围体选中更多候选，
  这是恢复正确的可见性范围；每帧两个 Worker start / GPU promotion 的预算不变。

## 验证证据

- 开发构建 `npm run build` 通过。
- 修复前 `--includeName consecutive`：新增三项失败，
  包括 descendant 提前 renderable、bounds 归零和两种 GPU cover 出现 FLAT；
  修复后同一筛选通过。合法 terminal root FLAT 的第四项回归也通过。
- `--includeName '/SceneGIS\/Scene\/SceneGISPlanarTerrain |retains elevated cover across consecutive/'`：
  19/19 通过，其中 runtime 17 项，新增真实 WebGL Surface 2 项。
- `SceneGIS/Scene/SceneGISPlanarQuadtree`：18/18 通过。
- `SceneGIS/Scene/SceneGISPlanarSurface`：47/48 通过；
  更宽 `SceneGISPlanarTerrain` 筛选为 68/70 通过。
- GPU 回归由已就绪 root 直接细化到两级 unavailable 的子级，逐帧验证 active mesh 高度与
  `scene.pickPosition` 为 40 米、覆盖非空、无 FLAT 接替、最终到达目标层级、
  provider 仅请求 root、Worker / upload 预算、稳态无额外工作以及 detach 资源释放平衡。
- 三项旧像素断言失败已对照 `12171614c5` 的 Terrain runtime：
  `publishes absolute height, slope, and north-clockwise downslope aspect pixels`、
  `composes imagery, Material alpha, and lighting in that order`、
  `reveals overlapping terrain layers across frusta (linear depth)`。
  最后一项在完整 Surface 套件中复现，单独筛选时不稳定复现；
  未将这些既有问题混入本项修复。
- Scoped ESLint / Prettier、`git diff --check` 与全量 AgentDocs Markdownlint 通过。
  显式全量 AgentDocs Prettier 检查仍报告 524 个既有文件格式问题；
  本项三个 AgentDocs 文件全部通过，未顺带格式化无关文件。

## 剩余风险与下一步

- 当前仅验证可控数据的多级缺失路径，负责人原场景尚未提供复测结果；
  由负责人复测后关闭 standalone plan。
- 若所有祖先均没有真实高程，仍按既有 root 契约保留 Z=0 并报告 root 不可用；
  不合成不存在的真实高程。
- 上述三项基线像素测试仍需后续单独排查；负责人可据此决定后续范围，
  当前 Agent 未更改相关渲染或测试阈值。
- 2026-10-20 按负责人要求形成本地提交，未推送；此前模型压平与 S3M 已快进合并至
  `scenegis/develop@12171614c5`。提交授权不替代原场景视觉验收。
