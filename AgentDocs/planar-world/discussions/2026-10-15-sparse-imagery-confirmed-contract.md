# 局部影像与最低层级确认契约

- Type: discussion / confirmed requirements
- Status: resolved；负责人已确认产品边界并批准实现，当前进展见 standalone plan
- Author / owner: 当前 Agent / Architecture；产品决定来自项目负责人
- Created / Updated: 2026-10-15
- Source baseline: `scenegis/develop @ c6ac9e2080a51c1e867df8f2c4b7d451c3d7deed`
- Parent plan: None；既有 planar-world extension 与通用影像 standalone 均 completed
- Supersedes: [全球网格局部影像与最低数据层级初评](2026-10-15-sparse-imagery-minimum-level.md)
- Related ADR: [ADR-0005](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)、
  [ADR-0082](../../../Documentation/SceneGIS/Decisions/ADR-0082-planar-imagery-protocols.md)
- Review: 当前为需求讨论结论，不代表实现或视觉 review 已通过
- Upstream-owned files / SGP: 本轮无；本轮只更新 AgentDocs

## 已确认的产品边界

| 初评事项              | 负责人结论                                                   | 处置                                                            |
| --------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| SI-D01 覆盖与缺图来源 | 覆盖范围由 SDK 配置；404 为缺图                              | 不建设自动 coverage discovery，不要求用户再次确认 404 语义      |
| SI-D02 远景行为       | 不存在的父层不显示、不请求；只有子层从父层采样，没有反向采样 | 取消细图拼父图、绘制分区、overview/mosaic 和相关远景超预算策略  |
| SI-D03 层级缺口       | 数据层级连续                                                 | 使用 minimumLevel..maximumLevel，不新增 availableLevels         |
| SI-D04 覆盖边界       | SDK 配置有效覆盖范围                                         | 范围只约束请求/显示，不能改变全球网格原点、extent、分辨率或 XYZ |

这里的“父层不显示”只针对缺少数据的该影像层；地表几何、其他影像层和 baseColor 仍正常显示。
不设置新的相机高度或 camera zoom 阈值，也不为了显示该影像层强制细化地表。
判定依据是当前实际 render surface tile 的层级，包括地形尚未就绪时实际使用的粗 ancestor cover。
因此相同视图下，较粗区域可能暂不显示该层，已达到最低层级的区域可以正常显示。

## 最小运行时方案

保留 world 的 canonical tilingScheme identity、全球原始 XYZ、地表/地形 LOD 和单次地表图层合成。
每 surface tile / layer 仍最多持有一个 desired 和一个必要 fallback，不增加多图纹理绑定或绘制分区。

设实际地表 tile 层级为 S，影像最小/最大层级为 min/max：

| 条件                   | 地址与请求                                             | 显示                                     |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------- |
| 与 SDK coverage 不相交 | 不创建影像请求                                         | 该层透明，下层/baseColor 保持            |
| S < min                | 不创建 desired 或 bootstrap 请求；不使用缓存中的细子图 | 该层透明，不改变地表                     |
| min <= S <= max        | desired 为原始 S/x/y                                   | 同层图就绪后正常采样；等待时可用合法祖先 |
| S > max                | desired 为 max 层的全球祖先地址                        | 沿用现有 ancestor UV 放大采样            |

`minimumLevel` 默认 0，校验 `0 <= min <= max <= maximumSafeLevel`。
构造参数、getter、structural provider 校验和直接 request 地址校验必须一致。
禁止把 `D = max(S, min)` 用于 S<min，因为它会生成本次已明确排除的反向采样需求。
高于 maximumLevel 的地表可以继续显示粗图；最低层级下没有可用数据时不制造假 Level 0。

Fallback 只允许 `min <= ancestorLevel < desiredLevel`，优先复用最近 READY ancestor。
需要 bootstrap 时使用当前地址对应的 min 层祖先，禁止固定请求 0/0/0；desired 已在 min 时不重复 bootstrap。
原始 ancestor 坐标按 `floor(x / 2 ** delta)`、`floor(y / 2 ** delta)` 计算，不减去局部范围的 tile 起点。
不新增主动请求所有中间祖先的策略。已知缺图的父地址跳过，但父地址缺图不能推断其子图也不存在。

如果 desired 返回 404，可继续使用已就绪的合法祖先；已经开始且仍有用的合法 bootstrap 可以结算后提供图像。
该必要 fallback 未结算时仍计入 loading；不存在合法父图时显示下层/baseColor。
网络错误继续走原有失败/retry 通道，不用反复请求父层来掩盖错误。

## SDK 配置与协议边界

SDK 向引擎 Provider 显式传入连续 min/max 和 coverage；字段名建议沿用初评的 `coverageExtent`，
最终英文 JSDoc/类型由后续 plan 与 ADR 固化。coverage 使用相同米制 XY 的矩形 Extent，
不引入 geodetic Rectangle、CRS 重投影、局部世界或局部 SingleTile。

覆盖边界不必贴齐瓦片网格。请求相交的完整原始 tile，并在 layer 采样/合成时限制覆盖范围，
范围外只让该层透明，不能 discard 整个地表。允许增加局部 UV 覆盖 mask；
不需要改成多图拼接或多次绘制。无 coverage 的既有用法保持原 world 搜索域与默认行为。

URL XYZ 原始 z/x/y 不变；TMS 只在服务请求中翻转 Y；WMTS labels 仍按 canonical level 查找，
不能改为 labels[level-min]。只校验实际可请求区间内的 labels，层号和服务标识互不替代。
WMS 保留完整 canonical tile BBOX 和原 axisOrder，不能把 BBOX 缩成 coverage 后拉伸响应。

TMS fromUrl 仍验证网格原点、CRS、像素尺寸和分辨率。放宽“必须从 canonical 0 开始”，
由分辨率识别真实最小层级，并验证连续二分层级；href/order 继续映射真实 canonical level。
SDK coverage 不可覆盖错误的网格元数据；局部 BoundingBox 不能变成新 Origin。
XML 与 SDK 范围/层级配置有冲突时明确报告，不能暗中扩张或重新编号。

## HTTP 404 与其他状态

平面运行时的 tile image 请求收到可确认的 HTTP 404 时，按该地址缺图处理：
进入 terminal UNAVAILABLE，不上传纹理、不触发普通故障重试，也不阻塞永久加载。
缺图记录仍有效时不重复请求；记录随 runtime generation、缓存与图层生命周期管理，
WMTS dimensions 或来源更新后失效，不保留无界全局负缓存。

此规则只针对 tile image 请求。TMS metadata XML 404 属于来源初始化失败，不能生成一个假就绪空 Provider。
HTTP 401/403、5xx、网络/CORS、解码和尺寸错误继续通过 errorEvent 报告；
不能把浏览器没有暴露 status 的 generic rejection 猜成 404。
实现前须核对当前 Resource.fetchImage 的错误传递与测试方法，按实际 transport evidence 分类。

建议先在共享 imagery runtime 识别明确 404，保留现有 requestImage Promise/undefined 契约；
本次无需新增 public null sentinel、通用 availability callback 或按像素识别空图。
同步 undefined 仍只表示节流延后；正常透明 PNG 仍是 READY 数据，不用祖先图覆盖其透明内容。

## Readiness 与生命周期

S<min、coverage 外及无可执行 fallback 的缺图都属于当前视图 settled；
真正的 desired/必要 fallback 请求、decode 与 upload 未结算时 tilesLoaded=false。
tilesLoaded 不承诺所有数据存在；普通 terminal failure 的原因仍通过错误通道可观察。
保留现有按需渲染 afterRender 唤醒，稳定视图与全缺图场景必须收敛，不增加 settling frames 或 retry loop。

图层 hide/remove/destroy、tile eviction 和 source generation 失效时继续使用已有引用计数、Request.cancel、
迟到结果隔离与 image/texture exactly-once 释放。Provider 继续 caller-owned。
采样范围与透明占位只在 normal render 发布，pick/depth replay 使用最后已发布快照。
缩远后粗父 tile 不得因缓存已有子图而恢复已排除的反向采样。

## 后续实现与验证范围

后续可用一个 standalone plan 管理本次连续层级、coverage 与 404 增量。
正式 ADR 修订 ADR-0005 的 minimumLevel/bootstrap 和 ADR-0082 的完整 TMS pyramid/局部覆盖边界，
同时保留单 surface command、单图采样与独立 geometry LOD 契约。无需以初评的多分区方案建立大型 extension。

预计涉及 SceneGIS-owned Provider/interface、imagery manager/binding、surface slot/shader coverage mask、
相应 Specs、指南与本地例子；具体影响路径以实施前当前源码复核为准。预计 upstream-owned files=0 / SGP=None。
不修改 SDK engine lock，不修改上游 Globe Provider，不手工编辑任何生成 barrel、types、shader JS 或 SpecList。

必要验证按风险限定为：

- min>0 的构造、getter、structural/直接 request 校验；S<min 无请求且该层透明。
- S=min 同层加载、S>max 合法 ancestor UV；真实地形粗 cover 不会触发细影像拼接。
- coverage 不对齐网格时，XYZ 不变、局部边缘不拉伸、范围外保留下层和地表。
- URL/WMS/WMTS/TMS 在同一 canonical 地址保持各自编码；TMS 从真实非零层级连续开始。
- tile 404 结算、父图404不阻止子图、fallback 请求结算；401/403/5xx/解码错误仍可观察。
- 缩放跨过 min、全部404、show/hide、dimensions 更新的按需渲染收敛与迟到资源释放。
- min=0、样式、SingleTile 与 depth/pick 的既有路径回归；API 改动后运行完整构建与类型检查。
- 一个本地可复现页面展示近景有图、远景无该层、coverage 边缘和404空洞；负责人确认实际画面。

上述行为的实施与验证结果以 standalone plan 和技术自审为准。HTTP status 可观测性、
coverage 边缘采样、404/fallback readiness 与资源收敛均有对应证据；不引入远景拼接预算。

本次只固化讨论结论，不把需求确认等同于实现、Specs 或视觉验收完成。

实施记录：[standalone plan](../plans/2026-10-15-sparse-imagery.md) 与
[技术自审](../reviews/2026-10-15-sparse-imagery.md)；负责人于 2026-10-15 确认视觉验收通过，visual gate 已关闭。
