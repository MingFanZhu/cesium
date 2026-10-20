# Discussion: S3M loading boundaries

## Metadata

- Status: `resolved` for the initial 1.0 profile；新版资格 deferred
- Owner role: `architecture`
- Created / Updated: `2026-10-20`
- Related plan: [兼容性评估](../plans/2026-10-20-compatibility-audit.md)
- Resulting ADR: ADR-0174；Related SGP: None

## Baseline and sources

下文保留最初评估的证据和未决项；后续处置见末节，不把实现后的验证回写成
评估时已经掌握的事实。

当前仓库为 Cesium 1.144.0，评估时 HEAD 为 `b4d7f1b469`。外部源码固定为
SuperMap/s3m-spec 的 `462cf06b95857fe2410dce9aecbfd8e4c16e84fc`。

- [官方 JS SDK](https://github.com/SuperMap/s3m-spec/blob/462cf06b95857fe2410dce9aecbfd8e4c16e84fc/S3M_SDK/S3M_JS/README.md)
  声明支持 1.0、2.0、3.0 和 CH/T 9040-2023，并提示纹理限制。
- [仓库说明](https://github.com/SuperMap/s3m-spec/blob/462cf06b95857fe2410dce9aecbfd8e4c16e84fc/README.md)
  区分 Specification 的 CC BY-ND 4.0 与 SDK、转换工具、相关范例的 Apache 2.0。
  这不表示商业 iClient 产品整体都包含在该开源 SDK 中。
- [SCP 规范](https://github.com/SuperMap/s3m-spec/blob/462cf06b95857fe2410dce9aecbfd8e4c16e84fc/Specification/scp.json.md)
  定义 CRS、插入点、根瓦片和 Add / Replace LOD。
- [官方在线示例配置](https://www.supermapol.com/webgl/examples/webgl/js/config.js)
  提供晋江、索菲亚、BIM 等服务入口；其服务状态与内容可能变化。

以下外部路径相对 `S3M_SDK/S3M_JS/S3M_module/`。

## Verified sample evidence

| 数据                                       | 已核实                                                                 | 尚未证明                           |
| ------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------- |
| 官方 `data/CBD`，4 个瓦片                  | 二进制 1.0；全部解析；DXT 纹理                                         | SceneGIS 完整渲染、拾取与 LOD 验收 |
| 官方 `data/comModel`，5 个瓦片             | 二进制 1.0；全部解析；实例化样例                                       | 实例化绘制与对象身份正确性         |
| 用户旧 CBD 服务                            | config / 根瓦片 HTTP 200；根瓦片 103332 字节，与官方一致               | 整个服务目录是否一致               |
| 官方晋江 S3MB 服务                         | config 1.0，10 个根；OSGBFile、DXT、NONE；首根二进制 1.0，1051309 字节 | 全树绘制与性能                     |
| 官方寿宁阁高斯服务                         | config 3.01；PointCloudFile、MESHOPT、Ellipsoid_WGS84                  | 新版普通三角网模型兼容性           |
| 官方 SDK `gaussianSplatting/sculpture.scp` | config 3.01；仓库有配套二进制                                          | 本次下载二进制超时，未解码         |

9 个本地模型文件共解析出 214 个 geometry 记录。探针保留 DXT 压缩纹理，
没有把实际纹理采样画面计为已验证。官方 JS 仓库的两组模型样例目前都是旧版；
高斯数据不能代替新版 BIM / 三角网数据。在线索菲亚与 BIM 配置返回 XML，
本次只识别了响应类型，未将其误判为 JSON 数据损坏。

用户服务带 `Origin: http://localhost:8080` 的 config 响应未包含
`Access-Control-Allow-Origin`。命令行可读不表示不同源网页可直接读取；
实际示例需要同源部署或正确的服务端 CORS 配置。

## Loading and scheduling

- `S3MTilesLayer.js` 读取 tiles / rootTiles，构建独立 S3M 缓存与调度器。
- `S3MTile.js:getUrl` 已包含 iServer `data/path/` 规则，直接图层入口有复用基础；
  整场景发现、鉴权与商业 `scene.open` API 属于另一层。
- `S3MPageLod` 区分 Distance、Pixel、GeometryError，后者计算 SSE。
  不可将所有 rangeData 当成几何误差或直接套用 MVT 选级。
- 当前调度器在子层 ready 后替换父层；未确认完整实现 config 的 Add 语义。
- async 回调内直接调用同步 `S3ModelParser.parseBuffer`，解析仍在主线程；
  大瓦片需要 Worker、取消与资源所有权设计。

## Rendering and lifecycle

隔离 Chromium 中加载当前 `Build/CesiumUnminified/Cesium.js`，
分别创建 Scene、加载 CBD / comModel、定位根包围球并渲染。两次均失败：

```text
Deferred material layout requires ordinary depth-writing opaque commands.
```

`Factory/S3MCacheFileRenderEntity.js:getOpaqueRenderState` 对 opaque 状态启用
`BlendingState.ALPHA_BLEND`，命令进入 `CESIUM_3D_TILE` pass，触发当前
`packages/engine/Source/SceneGIS/Scene/_private/_SceneGISDeferredLayout.js`
校验。关闭校验无法证明 G-buffer 材质、法线、深度或后续光照正确。

其他需要处理的集成依赖：

- 导入 `S3MTilesLayer.js` 会替换全局 `Cesium.Scene.prototype.pick`，
  并在缺少时注入 `Cesium.defaultValue`。探针确认两种副作用；补齐后导入成功，
  defaultValue 不是本次绘制失败根因。
- `DDSTexture.js` 使用 context 私有字段和 GL；共享纹理、引用计数、销毁顺序
  需要接入现有资源生命周期。
- 当前 S3M Shader 使用简化光照，不能直接视作 SceneGIS 的物理材质管线。

## Format and coordinate gaps

- Parser 有 2.0、3.0、3.01、Draco、MeshOpt 分支，不能据此宣布全部组合兼容。
- `fromStandardTextureCompressType` 引用 `S3MPixelFormat.KTX2`，当前枚举没有
  该成员，材质加载也未见完整 KTX2 转码路径。README 声明不能代替逐格式测试。
- Draco 的固定相对 WASM 路径和模块初始化状态需要与 Worker / 发布机制对齐。
- 未发现完整的外部索引、S3MD / SQLite 属性查询和商业高级分析接入；
  对象 ID 拾取与完整属性读取应分别验收。
- `S3MTilesLayer.js:loadConfig` 的 SCENE3D 路径使用经纬度 ENU，另一分支依赖
  scene mode、坐标数值范围和 units。SceneGIS 平面 World 仍是 SCENE3D 且使用
  明确的米制 XYZ，不能复用该判断。
- 新规范使用 `position.point3D` / `unit`，旧样例使用平铺坐标 / `units`，
  需要显式规范化；球体 / 椭球基准与投影 CRS 必须核对，不能按数值大小猜测。

## Options and recommendation

1. 原样嵌入开源加载器：已证明存在全局副作用和渲染冲突，不推荐。
2. 复用有来源记录的解码能力，建立 SceneGIS 的 config、LOD、坐标、对象身份
   与生命周期适配层，评估将解码结果送入现有 Model 渲染管线：推荐验证方向，
   尚未确立具体内部 API 或全部材质映射。
3. 离线转 3D Tiles：可作为独立路线，但不能代替用户要求的直接加载，也需验证
   材质与属性是否损失。

## Follow-up actions

- Architecture：建立 extension plan，按版本、数据类型、几何 / 纹理压缩、
  LOD、坐标基准定义支持矩阵；优先官方样例，旧 CBD 仅补充回归。
- Architecture：补充新版普通模型的可重复样例；高斯样例只能证明自身路径。
- Execution（待分配）：先验证单瓦片进入现有管线，再扩展全树、拾取、定位、
  卸载、球面和平面契约。每个阶段以真实数据验收。
- 公共 API、Worker 或上游 hook 落地前完成 Architecture / ADR / SGP 流程。
  当前没有修改运行时，没有承诺“全部 S3M 兼容”。

## Implementation resolution

[S1](../plans/2026-10-20-phase-s1-model-bridge.md) 和
[S2](../plans/2026-10-20-phase-s2-layer.md) 已落实推荐方向：Worker 解码、
原生 Model、三类 PageLOD、显式 World 放置、原生拾取、定位和资源回收。
精模与实例化使用仓库离线 fixture；晋江使用官方服务有界子树的本地资格缓存。
完整结果与残余风险见 [S2 review](../reviews/2026-10-20-s2-review.md)。

新增格式、压缩与商业材质仍由 architecture 角色在取得样例后另开 phase；
高斯按用户要求不接入。旧 CBD 服务全树及其部署 CORS 不属于本轮通过范围。
