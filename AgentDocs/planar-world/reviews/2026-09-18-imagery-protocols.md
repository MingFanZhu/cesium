# 平面通用影像来源技术自审

- Type: implementation / architecture self-review
- Status: approved；技术自审与负责人视觉验收通过
- Author / owner: 当前 Agent；未启用独立评审 Agent
- Created / Updated: 2026-09-18
- Target: `codex/planar-imagery-protocols` 的通用影像增量
- Parent: [standalone plan](../plans/2026-09-18-imagery-protocols.md)
- Decision: [ADR-0082](../../../Documentation/SceneGIS/Decisions/ADR-0082-planar-imagery-protocols.md)
- Upstream-owned files / SGP: None

## 实现核对

完整清单按外部通用来源整理：URL template、WMS、WMTS、TMS、SingleTile。
新增四个 SceneGISPlanar 对应 Provider，沿用 Cesium 参数命名与异步 fromUrl 形态。
没有把专用厂商服务或程序化诊断图层算成新加载协议，也没有虚构 geographic Rectangle / ellipsoid。

URL 请求复用 Resource 和 Request，保留 headers / query / proxy，undefined 节流不转成 Promise。
WMS 明确 CRS / SRS 和轴序；WMTS 两种编码均支持非数字矩阵标识和静态维度。
TMS XML 核对 canonical 范围、SRS、原点、像素尺寸和逐级二分分辨率，保留 href 与 order；
既不猜测投影，也不把 metadata 失败伪装成可加载 provider。
SingleTile.fromUrl 持有可安全复用的 HTMLImageElement；同步请求路径仍给每个 runtime 独立 Bitmap。

WMTS dimensions 不直接释放 GPU，先标记所有订阅 runtime，下一 normal frame 再使各自 cache 失效。
订阅与 runtime 同生命周期；旧 Promise 返回的 Bitmap 成对 close，已发布纹理在下一 normal frame 前继续有效。
图层新增 / 显示立即失效 readiness，World 通过已有 afterRender 返回值唤醒 requestRenderMode。
稳定 ready 状态不注册 callback、不新增请求或持久资源；无新 Shader、Worker、draw call 或 Scene 上游修改。

## Finding

### IP-R001：按需渲染没有唤醒（P1，fixed）

- 复现：静止场景启用 requestRenderMode，maximumRenderTimeChange=Infinity，替换 WMTS dimensions。
  runtime.dirty=true，但 Scene 没有新帧；既有 Scene 的 tilesLoaded 检查只在真正渲染后的 endFrame 执行。
- 修复：World.update 在加载未完成时排入稳定的 afterRender callback，帧末再次检查 tilesLoaded，
  ready / destroyed 返回 false。Surface readiness 同步反映 runtime.dirty，图层新增 / 显示同步失效。
- 证据：GPU Spec 检查旧纹理保持、下一帧替换、callback 收敛和销毁；Chromium dev / release 在
  requestRenderMode 下实测新的 Time 请求，无手动 requestRender。

### IP-R002：KVP URL 中大小写重复参数（P2，fixed）

- 风险：含大写 REQUEST=GetCapabilities 的入口与新增小写 request=GetTile 并存，服务可能返回能力 XML。
- 修复：只清理协议拥有的大小写无关参数，再生成 GetTile；保留用户 query 和 headers，不修改调用方 Resource。
- 证据：WMTS 请求 Spec 使用上述入口，验证唯一 GetTile、auth/header 保留及 Request identity。

### IP-R003：本地 SVG 样例无法走栅格解码（P2，fixed）

- Chromium createImageBitmap 对当前 SVG Blob 返回 InvalidStateError；该路径契约为普通栅格影像。
- 示例改为现有 deterministic PNG generator 生成的四象限图和 512×256 单幅图，未增加运行时回退。
- 证据：两种构建均逐协议验证四个方向的真实像素，单幅图自然尺寸及 GPU 上传通过。

## 验证

- 累计 125 项 focused Specs 通过：通用 Provider、URL tags、原 imagery runtime / layer / collection、Surface 与 World。
  最后针对 URL / WMTS 的 8 项复测通过，包含原生 reverseZ 最大层边界与 KVP 大小写参数回归。
- 2 项 Chromium E2E 通过：dev / release 的六种入口、GUI 切换、TMS XML、WMS / WMTS HTTP 参数、
  四象限方向、非正方形 SingleTile、按需维度刷新、稳定帧和销毁。12 warm frames 资源计数不变，
  同机 render 调用约 0–1 ms，仅作参考。
- 完整 build / buildRelease / buildTs / buildDocs 通过，root / engine TypeScript 通过。
  新增 API 没有 TSD-JSDoc 警告；既有上游警告保留。
- 实际 engine tarball 定向 smoke 通过：四个新公开类、layer structural compatibility、fromUrl 类型、
  WMTS 只读参数、dimensions 与 World 销毁；按原生 @cesium/engine ambient module 名验证类型。
- 本项 ESLint / Prettier / Markdown 和 git diff --check 通过。全 AgentDocs Markdown 通过；
  全 AgentDocs Prettier 仍报告 288 份既有无关文件格式问题，本项文档已格式化。
- 上游审计通过：current delivery upstream-owned entries=0，generated status=0；本项 SGP=None。

## 边界与交接

要求服务与 world 使用同一米制坐标和 canonical 网格；无跨 CRS 重投影、局部覆盖、多根矩阵、
GetCapabilities 自动发现、feature picking 或 Clock / times 预取。厂商服务不新增专用适配。
完整 package verifier 既有 VectorTile 白名单缺项不属于本项；本项登记四个导出并用实际 tarball 定向验证。
TMS 稀疏覆盖等更宽网格能力需要单独设计，不能通过忽略 metadata 约束接纳。

负责人已确认 Test/Planar“影像服务”验收通过；技术自审与负责人视觉结论均已闭合。
同一工作区已有地形 metadata / clipping / atmosphere 变更保持独立，没有提交或 push。
