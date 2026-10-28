# Extension Plan: Static mesh and 3D Tiles voxelization

## Metadata

- Plan type: `extension`
- Status: `completed`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: current engine agent
- Created / updated: `2026-10-28` / `2026-10-29`
- Related discussions / reviews: [V2 approved](../reviews/2026-10-29-v2-tiles.md)
- ADR: [0194](../../../Documentation/SceneGIS/Decisions/ADR-0194-static-mesh-voxelization.md)
- SGP: None in V1; `SGP-0071` in V2

## Objective and boundaries

按调用方的局部米制区域、格宽与刚性放置，生成可保存的体素占据信息。通用 Core 接受显式三角网格；Scene adapter 按区域和模型误差主动请求 3D Tiles，复用原生加载/解码/实例变换。显示相机、屏幕深度、模型可见颜色不是占据依据。

表面保守覆盖与网格封闭区域填充分开。输出不宣称材料、建筑语义、精确内外分类或工程碰撞精度。首版不处理动态变形、点云推面、任意场景扫描、全球体素场或 SDK 发行包。

## Source facts

`ModelReader` 已提供解码后的 attributes/indices 和 node/instance transforms。`VoxelPrimitive` 消费已有体素，不提供网格体素化。原生 `Cesium3DTileset` most-detailed preload 复用请求、处理和 cache；需要明确的区域选级集成缝隙才能脱离相机/屏幕误差。

## Phase roadmap

| Phase | Objective                                              | Entry gate                        | Exit gate                                             | Status    | Plan                         |
| ----- | ------------------------------------------------------ | --------------------------------- | ----------------------------------------------------- | --------- | ---------------------------- |
| V1    | 通用网格、Worker、占据结果与预算/生命周期              | Core/Worker 构建路由确认          | 数值 Specs、Worker 取消、构建/类型、review 和独立提交 | completed | [V1](2026-10-28-v1-core.md)  |
| V2    | 区域 3D Tiles 主动加载、静态快照、SDK 文档及可复现实例 | V1 已提交，重查 native loader/LOD | 离屏区域、LOD、变换/实例、失败/取消、双世界及完整交付 | completed | [V2](2026-10-28-v2-tiles.md) |

## Cross-phase validation and acceptance

- 保守三角形覆盖、封闭/开口体、网格边界、裁剪、坐标变换和格宽对比。
- 数组布局 x-fastest；格心坐标与风场一致；调用方数据不被 detach 或改写。
- 不将未加载瓦片当成空气；缺失/失败中止完整结果，明确 source error 与 cell size 不等价。
- 任务取消/销毁释放 owned Worker，保留借用 tileset；正常渲染不隐式重复体素化。
- 更新源文件后运行相应完整 build/type 检查；逐阶段 checkpoint。

## Global risks and handoff

粗格网可封住孔洞；非闭合倾斜摄影不能保证内部填充；保守覆盖可能使薄墙变厚。源 geometricError 是数据生产者的指标，不是形状误差证明。大网格/几何读取有 CPU 与内存成本，必须预算化、报告实际统计，不以渲染 FPS 代替体素化耗时。
