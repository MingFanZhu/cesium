# B1 原生实例合批 review

- Type: architecture / code review
- Status: approved
- Owner role: architecture（当前任务自审，未启用独立 Agent）
- Created / Updated: 2026-10-19
- Target: [B1 plan](../plans/2026-10-19-b1-native-instances.md)
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## Findings

| ID    | Severity | Status   | Evidence / disposition                                                                                                                                                              |
| ----- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1-R1 | medium   | fixed    | 原生中间 GeometryInstance 数组原先会长期保留；batch 改为 releaseGeometryInstances=true，Specs 验证初始化后释放、attributes 仍可查询、appearance rebuild 保留值。                    |
| B1-R2 | medium   | fixed    | 属性 schema 不一致时原生只保留交集；构造期显式拒绝，避免独立 show/color 静默丢失。                                                                                                  |
| B1-R3 | low      | fixed    | 旧 ContentVisualizer 集成测试未把 ground 所属 World 接入 Scene；修正为独立 Scene 生命周期并使用既有 world 初始化入口，原测试的渲染、depth、pick、变换与销毁断言完整保留，2/2 通过。 |
| B1-R4 | low      | fixed    | 旧红色 Color material 测试使用默认 translucent render state，与当前 deferred opaque 契约不一致；显式 opaque Appearance，未改变产品 renderer。                                       |
| B1-R5 | low      | accepted | 原生 allowPicking=false 仍为每实例建立 CPU PickId；仅关闭 pick command ID。测试改验不可拾取、warm 无新增 PickId 与 GPU 释放，未改上游语义。                                         |
| B1-R6 | low      | accepted | 标准 build-docs 的 pedantic 模式被未改动的 Scene.js 两处旧 @type 描述警告阻断；相同配置去掉 pedantic 后 API HTML 生成成功。无新增本次 API 文档告警。                                |

## 验证

严格 SDK 类型用例发现原有 GeometryInstanceAttribute 的 number[] 声明不兼容原生 color/show TypedArray。
新增结构化 InstanceAttribute 类型后通过；未修改上游声明生成器。复现命令：

```powershell
npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarPrimitiveTypes.ts Source/Cesium.d.ts packages/engine/index.d.ts
```

- Chrome Headless 155 / Windows 10，真实 WebGL：Primitive 16/16，release 16/16。
- SceneGIS/DataSources 102 项首次 101 通过、1 项 fixture 失败；修复该 fixture 后定向 2/2 通过，其他产品路径未修改。
- 覆盖不同 origin 的两千万米坐标、局部/整体矩阵、独立 ID pick、color/show、混合体、线颜色、snapshot、候选失败与资源释放。
- 1024-object batch：一个 native Primitive、一个 VA、一条 color command；20 warm frames 和局部 show 更新保持资源 identity。
- dev/release build、build-ts、tsc 通过；ESLint 通过。API HTML 非 pedantic 构建通过，标准命令限制见 B1-R6。
- AgentDocs 全量 markdownlint 通过；全量 Prettier 报 452 个既有文件，未批量重排；新增目录 scoped check 通过。
- 可复现示例：[平面图形合批](../../../Test/平面图形合批.html)，1280×900、DPR 1、本地无网络数据，画面与隔列显隐截图已检查。
- 同一浏览器、同一数据，先 warm 合批再逐对象/合批对照，20 帧 CPU 提交 median/P95：逐对象 6.0/9.0 ms，合批 0.4/0.6 ms；Primitive/VA/color command 均由 1024 降到 1。
  该指标不包含 GPU fence 等待，不作跨设备性能承诺；冷启动合批首帧 180.7 ms 包含 shader/renderer 初始化，不能与 warm 对照直接相比。

## 边界与剩余风险

- 所有产品修改均在 SceneGIS-owned 路径；upstream-owned files=0，新增/变更 SGP=0，生成文件不提交。
- 同步首帧与整批拓扑重建、整批剔除、透明排序仍按原生粒度；SDK 需要空间/Appearance 分批。
- 本阶段仅普通合批；项目负责人已确认 B2 同时补齐贴地线与面，B1 提交后进入其独立设计与实现。
