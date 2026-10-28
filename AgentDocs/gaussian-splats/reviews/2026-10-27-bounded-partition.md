# Review：大规模 PLY 分块排序内存

## Metadata

- Type: architecture / code review
- Status: completed
- Owner / reviewer: 本任务（未启用独立评审 Agent）
- Date: 2026-10-27
- Target: [standalone plan](../plans/2026-10-27-bounded-partition.md)
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: 无
- Upstream-owned files: 无

## Findings and disposition

| ID  | Severity | Finding                                                                    | Disposition / evidence                                                                                                   |
| --- | -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| G11 | high     | 213607102 点的全量 radix arrays 至少约 5.57 GiB，temporaryIndices 分配失败 | fixed：普通 build 使用 Tools-owned 磁盘分块排序，取消全源 Morton/indices/inverse mapping 数组；真实数据全量排序/读回通过 |
| G12 | medium   | 分块完成前创建 reducer workers，提前占用内存且此阶段无工作                 | fixed：排序完成后创建，原串行/并行物理 part 调度与清理测试通过                                                           |
| G13 | low      | 旧 visual-error policy 测试引用 test 根目录中不存在的 fixture              | fixed：改为现存 fixtures 子目录；未放宽 policy/CRC 校验                                                                  |

## Verification

- `npm test --prefix Tools/GaussianSplatTiler`：82/82 通过。
- 新测试覆盖跨 run / 多轮归并、相同 Morton ties、原 stableId 和全部 raw 属性一致，
  SH3 / big-endian、稀疏 occupied cells、排序中失败/消费前失败/提前结束清理。
- 原 400013 点测试继续覆盖物理 part 边界、串行/12 workers 字节一致和中途失败清理。
- 修改前后相同 967 点实际回归 fixture 构建的 MCI、manifest、Core pack 逐字节一致。
- 变更 JS 的 ESLint recommended / Node globals / curly / prefer-template 检查通过；
  工具路径不属于根 ESLint 默认扫描范围，未改变上游 lint 配置。Prettier、Markdown lint
  和本次路径的 diff whitespace 检查通过。
- 仅 Tools 源码和 Node tests，不改浏览器 shader、shared radix、Worker entry、协议或 SDK；
  不触发全引擎构建。保留上一轮尚未提交的使用文档。

## Real-data evidence

真实输入为 213607102 点、SH0、14525283864 bytes，header 含 EPSG 4549 / offsets，
采样位置在局部米制范围；本缺陷不是大坐标 Float32 量化。
全文件扫描、排序及两轮归并完成，输出 1846 个物理 part：排序耗时 2017.485 秒，
采样 RSS 峰值 309465088 bytes（约 295 MiB）；排序文件 16234139752 bytes，
逻辑临时盘峰值 32468279504 bytes（约 30.24 GiB）。环境为 Windows / Node 24.9，
与其他应用共享机器，输入与临时文件同盘；数据不代表一般吞吐保证。
RSS 不含操作系统文件缓存或后续 LOD workers。sequential part readback 完成，
总计 213607102 点，扫描/排序/归并/读回合计 2201.632 秒，采样峰值仍为 309465088 bytes。
本次 mkdtemp 临时目录已移除，用户原始 PLY 和目标产品目录没有被修改。
验证只针对发生错误的分块及 raw 输入链，不承诺已生成完整两亿点 LOD 成品。

## Remaining boundaries

磁盘排序减少 RAM 峰值但增加顺序磁盘 I/O，排序 spool 最坏约需两倍记录总量。
后续 reduction 的内存仍随 workers/part 内容增加，建议本机大数据先使用 1～2 workers。
元数据仍随 occupied cells/parts/runs 增长，未承诺任意规模固定内存。
G10 的 double 大坐标预量化限制保持原状，本次数据的局部点不触发该问题。
地理定位仍需显式配置，未用 PLY comments 自动套用 EPSG 或 offset。
