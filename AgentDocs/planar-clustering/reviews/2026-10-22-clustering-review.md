# Review: 平面原生聚类

## Metadata

- Status: `approved`（技术 review 完成；负责人已指示合并）
- Reviewer role: `architecture`，当前维护 Agent 自审
- Created / Updated: `2026-10-22`
- Review target: 本轮实现、Specs、Viewer E2E、ADR-0183 / SGP-0066
- Related plan: [实现与资格](../plans/2026-10-22-planar-clustering.md)

## Findings

| ID  | Severity | Finding                                                                                 | Owner / disposition | Evidence                                                                    |
| --- | -------- | --------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| R1  | high     | 原生点的额外 Y 翻转造成混合类型上下镜像合并，聚类 centroid 错位                         | execution / fixed   | 统一点到左上角 window 坐标；新增离中心混合类型 Spec；12 组截图位置正确      |
| R2  | medium   | 关闭类型后旧 clusterShow 和全部关闭时旧簇可能残留                                       | execution / fixed   | planar prepare 恢复 source visibility；类型开关 Spec 与 E2E                 |
| R3  | medium   | enabled 聚类沿用椭球 horizon / cartographic height 不适用于平面，正交变化不能按高度推断 | execution / fixed   | 实例空间策略；零原点、大坐标、正交/resize/behind-camera Specs               |
| R4  | medium   | 动态 position / show / 样式尺寸 / terrain 更新需使缓存失效，冻结 clock 不能跳过属性读取 | execution / fixed   | resolved 属性快照；动态与 availability / terrain Specs；warm E2E 零重复事件 |

## Validation

- 开发版：聚类 10、Anchor 11、gate 10、原生 EntityCluster 16 Specs 通过。
- 发布版：聚类 10、原生 EntityCluster 16 Specs 通过。
- Viewer E2E 开发/发布各 1 通过：288 对象、12 簇，原 Entity / cluster 数组拾取、冻结时间动态更新、类型与 show 开关、六次移除重加、GeoJSON/CZML。
- 截图：透视聚类、正交聚类、未聚类；维护者已查看开发版及发布版截图。产物位于忽略的 Build/Specs/e2e/planar-clustering。
- 同机 Chromium / ANGLE D3D11 / RTX 3060 Ti，1280×900，30 帧 CPU render 调用诊断：开发版关闭聚类 median/P95 1.1/1.8 ms，静止聚类 1.4/2.0 ms，位置变化 2.6/3.3 ms；发布版对应 1.0/1.9、1.4/2.4、2.8/4.5 ms。不是 GPU 时间或跨设备性能保证。
- 静止帧无 clusterEvent；移除时原 collection 全部销毁，camera.changed 监听数量平衡。无新 GPU pass / Shader / Worker。
- build-release、build-ts、tsc、scoped ESLint/Prettier 与 upstream audit 通过；private helper 未进入生成声明。
- 唯一 upstream-owned 修改：packages/engine/Source/DataSources/EntityCluster.js，SGP-0066。
- AgentDocs 全量 Markdown / 格式检查结果在 plan 记录；已有格式基线不批量修复。

## Remaining risks and follow-up

没有未解决的产品实现 finding。聚类沿用原生屏幕布局语义，不是 terrain occlusion；
自定义大簇图标不参与第二次碰撞排布，无稳定簇 ID。不同 DataSource 默认独立。
负责人已指示合并；实现提交 `7920311615` 已快进合入 `scenegis/develop`，无额外源码修改。
既有 Specs、构建与截图证据仍适用；本轮仅更新交接记录与清理已合并的本地分支，未推送。
