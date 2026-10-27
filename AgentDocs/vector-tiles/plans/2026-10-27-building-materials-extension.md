# MVT 建筑 PBR 材质

- Type: extension plan
- Status: active
- Date: 2026-10-27
- Owner: 当前 Agent，architecture / implementation / self-review
- Branch: `feature/mvt-building-materials`
- Base: `e534dd9abc`
- Current phase: B1 completed; B2 pending checkpoint
- Related: ADR-0074、ADR-0075、ADR-0161；新决定 ADR-0192

## 目标与边界

为已有 fill-extrusion 增加墙面/屋顶独立 PBR、米制重复和属性/ID 材质选择。
复用 Layer、Worker、几何合批、cover、拾取、地形 anchor 和销毁。
保留纯色/pattern、地图排序与透明度，覆盖 Globe / Planar。
玻璃为有色、不透射的 PBR 外墙；不增加内部房间、折射、楼栋拼接、调度器或 SDK。
源数据缺少稳定 ID、轮廓变化、地形 anchor 差异不以伪造全局建筑身份掩盖。

## 阶段

| Phase | 范围                                          | 退出条件                                                | 状态      |
| ----- | --------------------------------------------- | ------------------------------------------------------- | --------- |
| B1    | Style、材质参数、稳定坐标和 Worker atlas 契约 | Core/Worker 专项、自审、独立本地提交                    | completed |
| B2    | 共享资源、材质采样、延迟/透明光照与反射       | GPU、排序/拾取/销毁、自审、独立本地提交                 | planned   |
| B3    | OpenFreeMap 纽约、免费纹理、白天/傍晚及交付   | 构建类型、真实画面、接缝/远景/性能证据，负责人视觉 gate | planned   |

各阶段只在进入时细化实现；不推送。既有 D2 动态规则人工 gate 独立保留，
本工作不将该 gate 记为通过。已有高斯切片器文档修改不属于本扩展。

## 验收

多个建筑共享 atlas，warm frame 不重复请求/上传；跨分段和瓦片保持相同材质 ID 与 UV 相位。
同样太阳条件下验证砖石漫反射、玻璃高光/天空反射、屋顶和 emissive；保持 shadow 与 style tag。
示例直接加载 OpenFreeMap 公网纽约数据，不保留街区快照；固定相机与太阳时刻用于对照。
纹理资源来源、许可证与加工记录随示例交付；公网数据变更和服务可用性属于示例边界。
测量同场景纯色/材质的 CPU/GPU/资源和命令差异，不宣称跨设备固定帧率。
