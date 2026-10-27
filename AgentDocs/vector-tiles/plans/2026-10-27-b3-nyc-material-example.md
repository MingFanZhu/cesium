# B3：纽约公网示例与交付资格

- Type: phase plan
- Status: active；implementation / technical validation completed；owner visual gate pending；B2 checkpoint d7319e1f05
- Date: 2026-10-27
- Owner: 当前 Agent，architecture / implementation / self-review
- Architecture review: design confirmed
- Parent: [extension](2026-10-27-building-materials-extension.md)
- Related: ADR-0192；upstream-owned / SGP：预期无

## 源码与数据事实

根 server 支持 Test HTML，runtime 仅使用 `/Build/CesiumUnminified/index.js`。
Layer 现有 TileJSON/source、style 和材质参数可以直接组装；示例不添加渲染实现。
Scene-owned environmentEffects、原生 ShadowMap、SSR 和 Planar astronomical environment 已有公开 API。
OpenFreeMap 当前 planet TileJSON 最大 z14，building 使用 render_height / render_min_height。
按负责人指令直接请求公网，无街区快照、离线瓦片或本地地图 fallback；错误可见。

## 设计

- 单一 `Test/vector-tiles/building-materials/` HTML/JS，URL 选择 Globe 或 Planar。
- 纽约原点固定；Globe 源为全 Mercator，Planar 把完整 matrix 平移缩放到纽约原点局部米，
  tile z/x/y 不变。此步骤只是例子数据坐标配置，不添加 engine 投影特例。
- 免费 ambientCG CC0 立面、玻璃、砖和屋顶贴图缩小后随示例分发，保留源 URL、许可证和加工脚本。
  不下载或提交纽约 MVT 快照。素材 raw ZIP 仅在忽略的 Build 下加工。
- 负责人提供城市风格参考并指出单一蓝灰窗格过于单调，随后明确允许原创生图。
  采用原创浅石材窗列、暖砖窗洞和灰色平屋顶，搭配 ambientCG 玻璃与颜色变体；
  原始生图和提示词进入 Test，技术通道推导脚本不进入 runtime。
  源 colour 分类优先于 ID 变化，以减少独立 building part 的风格跳变。
  实景发现 decoded ID 为字符串，示例与文档改为显式 to-number，并增加 Core 回归。
- 同一相机的白天/傍晚、材质/纯色、SSR 开关、近景/远景入口；属性和稳定 ID 控制建筑差异。
  保持窗口物理尺寸说明、来源署名、网络错误和 idempotent BFCache-aware 清理。
- 固定 viewport 与相机收集实景画面、短距离连续运动/瓦片接缝和远景观察。
  测量相同场景纯色/材质 warm CPU render 时间、draw/Worker/请求/材质内存；可用时 GPU timer。
  不用单帧 FPS 或像素 hash 代替视觉判断；不建立无必要浏览器矩阵。

## 验证与退出

1. PNG/JPG 通道、窗口/楼层 repeat 与许可证记录；公网纽约两世界实际绘制、白天/傍晚截图。
2. 配置切换、真实拾取、重复移除/创建与销毁；记录瓦片/LOD/远景观察和可重现限制。
3. 完整 development/release build、buildTs 后 tsc；公共导入/声明检查，发布版材质专项。
4. 文档、self-review、独立本地 checkpoint。负责人视觉 gate 单独保持 pending，提供可直接打开的页面。

若实景暴露引擎缺陷，仅对有复现证据的根因修正并追加相应最小验证；不扩大到其他子系统。

## 阶段交付

实现与技术自审完成，结果见 [B3 review](../reviews/2026-10-27-b3-material-example.md)。
素材由初始公共贴图调整为原创石材/砖窗/平屋顶与 CC0 玻璃组合，按负责人参考图反馈收敛。
本阶段形成独立本地技术检查点；负责人视觉 gate 保留 pending，没有下一实现阶段。
