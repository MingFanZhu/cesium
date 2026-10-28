# Review：切片器使用说明与坐标核对

## Metadata

- Type: documentation / code investigation review
- Status: completed
- Owner / reviewer: 本任务（未启用独立评审 Agent）
- Date: 2026-10-27
- Target: [standalone plan](../plans/2026-10-27-tiler-usage.md)
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: 无
- Upstream-owned files: 无

## Findings and disposition

| ID  | Severity | Finding                                                                       | Disposition / evidence                                                                                                                                                |
| --- | -------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G8  | medium   | 原 README 未列全参数，且只声明 little-endian                                  | fixed：独立使用说明覆盖 12 个普通 CLI 选项、已有 LOD CLI 与 10 个 manifest 字段；big-endian 构建/validate 实测通过                                                    |
| G9  | medium   | 中心点元信息容易被误解成自动平移，EPSG 注释容易被误解成重投影                 | fixed（文档）：列出两条路径的注释处理、矩阵乘法顺序、ENU/投影/ECEF 示例；坐标选项改变而 sourceBounds/packs 保持一致的合成探针通过                                     |
| G10 | medium   | 普通 raw spool 在 rebasing 前把 double 源坐标写为 Float32，可能损失大坐标细节 | documented limitation：调用真实 writeRawRecord 复现 4000000.125→4000000；说明要求源精度下先局部化。未修改实现，不声称已修复；已有 LOD 路径的 double rebasing 测试通过 |

## Verification

- `node --test Tools/GaussianSplatTiler/test/segmentedTileSizeCli.test.js Tools/GaussianSplatTiler/test/prebuiltLod.test.js`：16/16 通过。
  覆盖 CLI build/inspect/validate、自定义 cell、已有 LOD 坐标注释冲突和 double rebasing。
- 使用原有 16 点 fixture，以全部 12 个 CLI 选项生成带 EPSG/offset 注释的 big-endian
  产品，inspect/validate 通过；与原 little-endian 产品的 Core packs 字节一致，
  sourceBounds 不变，非 identity localToFixed 和 localOrigin 原样写入索引。
- 从源码白名单核对文档参数覆盖：12/12 CLI，10/10 manifest。
- 仅交付 Markdown；没有修改生成文件、切片算法、协议、引擎或 SDK。
- 6 个改动 Markdown 的 Prettier、markdownlint、相对文件链接与 diff whitespace 检查通过。

## Remaining risks and handoff

G10 为已确认的现有实现限制，本次按用户请求完成说明，未顺带改变数据路径。
后续如需直接接收完整投影/ECEF 大坐标，应另行确定精度需求并修复 rebasing 顺序；
负责人确认扩展该范围后由执行角色在本扩展继续。当前可使用已说明的输入预处理方式。
未提供真实用户 PLY/配准文件，不能确认其中心点语义或实际 CRS/高程基准。
validate 仅证明产品一致性，不证明地理配准；本次无新增运行时风险，无须全引擎构建。
