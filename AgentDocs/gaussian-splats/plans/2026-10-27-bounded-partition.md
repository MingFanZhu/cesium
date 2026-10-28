# 大规模 PLY 分块排序内存修复

## Metadata

- Type: standalone plan
- Status: completed
- Owner: 本任务（architecture / execution）
- Date: 2026-10-27
- Parent plan: 无；已完成迁移的缺陷修复
- ADR: ADR-0188，补充工具排序资源边界
- SGP: 无，修改仅限 SceneGIS-owned Tools / 文档
- Discussion: 用户实际数据已复现，无待决接口
- Review: [内存修复 review](../reviews/2026-10-27-bounded-partition.md)

## Failure and design

实际输入 213607102 点、14525283864 bytes、SH0、局部 float XYZ，header 有 EPSG/offset。
旧分块三个全量数组为 16N bytes，radix scratch 再需 12N bytes，总计约 5.57 GiB，
第二次排序和反向索引还可能叠加未回收数组。错误发生于 radix temporaryIndices allocation，
与 PLY 格式及中心点无关。调整 tileSize/batchSize 不能消除 O(N) 排序数组。

普通 build 使用磁盘排序：先按批扫描坐标，保存 occupied cell 数量/范围；再分批读取完整
Gaussian records，按 cell 次序、原 global Morton、source index 稳定排序为固定容量 runs，
最多 32 路归并，最终顺序读取最多 400000 点的物理 part。取消公开 build 中全量 indices、
反向映射与稠密包围盒 cell 数组。沿用 raw encoding、物理 part、LOD、MCI/GSP policy。
reducer workers 延迟到磁盘分块完成后创建。仅新增私有工具模块，不修改 shared radix 或渲染器。

默认 run 上限 262144 点；归并每路约 1 MiB 缓冲，输入仍按 batchSize。空间元信息随
occupied cells/parts 增长，LOD reduction 仍受现有 workers 控制；不宣称全构建固定总内存。
临时排序与最终 spool 的资源由本次 mkdtemp owner 释放，失败/迭代提前结束覆盖自动回归。
内部函数可接受较小 run/fan-in 供真实边界测试，不为测试增加产品分支。

## Validation and exit

1. 旧分块/stream 作为小输入对照，比较 stableIds、raw 属性、分块顺序；跨 run、同 Morton、
   多物理 part、跨归并轮次、异常/提前退出清理均覆盖。
2. 运行现有工具测试与小产品字节兼容性检查，无须引擎全量构建。
3. 用户全量 PLY 完成分块/顺序读取验证，记录 RSS 与临时盘；不提前承诺整套 LOD 构建耗时。
4. 使用说明更新普通切片排序资源边界，review/index 回写。保留上一轮未提交文档。

## Non-goals

不改 SDK、坐标转换、已知 raw Float32 大坐标限制、GPU 或 proxy 算法；不把清理其他应用、
增加 Node heap、关闭检查或自动减点作为修复。实际两亿点完整 LOD 成品仍需长时间 CPU 处理。

## Result

82 项工具测试通过；进度细化后的 4 项磁盘排序测试通过。旧/新 967 点产品 MCI、manifest、
Core pack 字节一致。真实 213607102 点完成两轮磁盘归并、1846 个 part 和全部读回，
RSS 采样峰值约 295 MiB，临时盘峰值约 30.24 GiB，目录自动清理。完整 LOD 成品未生成。
使用说明和 ADR 已同步，仅修改 owned Tools / 文档；2026-10-28 负责人授权与源坐标报告
及使用说明形成完整维护提交，详情见 review 和扩展索引。
