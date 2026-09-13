# ADR-0063：独立平面点标注

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Plan: [V5A](../../../AgentDocs/vector-tiles/plans/2026-09-13-v5a-point-symbols.md)
- Discussion: [Symbol architecture](../../../AgentDocs/vector-tiles/discussions/2026-09-13-symbol-architecture.md)
- Related: [ADR-0061](ADR-0061-owned-vector-tile-primitives.md)、[ADR-0058](ADR-0058-vector-tile-frontend-contract.md)
- SGP: None

负责人批准独立 symbol 子系统。Cesium 自有文字图元不作为地图文字能力边界；
复用通用 Renderer/Scene/pick，保持独立 MVT、style 与 point-layout。
MapLibre 参考确认 glyph dependencies、shaping、view collision、跨 tile identity 与 GPU drawing 分层。

## Decision

glyph PBF 与 MVT 各自独立解析，复用现有 protobuf Reader。Style 声明 glyphs/sprite，
不自行请求。Layer 实例拥有请求、CPU cache、atlas pages、候选、placement 和 GPU resources；
无导入副作用、隐式全局共享或另一个 WebGL context。
文字使用有符号距离场，普通 icon 使用 RGBA sprite；保留 glyph metrics、border、
sprite pixelRatio 和数据来源。禁止用逐 Entity/LabelCollection 或把整张地图绘入颜色纹理实现。

point anchors 来自匹配单 root tile matrix 的 MVT Point。完整世界坐标用于投影，
文字排版用 glyph em metrics 与 CSS pixels；GPU RTE 和 DPR 同当前平面 Renderer。
symbol 按 anchor ownership 与稳定空间/内容 identity 去重，允许完整 glyph 跨 tile 边界，
不能使用基础 geometry 的逐片元 region clipping。

同一 Layer 的 symbol styles/sources 共享屏幕 collision。text 与 icon 分别测试碰撞，
正确应用 allow-overlap、ignore-placement、optional；缺省联合显示。
层优先级、sort key 与稳定位置排序共同决定选择，不以请求完成顺序为优先级。
首轮固定 viewport-aligned point placement；沿线、map-aligned、复杂文字 shaping、variable placement、
动画淡入淡出、terrain/Globe 在独立阶段资格验证。

text-size/icon-size 在本 profile 按精确 fractional zoom 表达式求值，
其余 layout/filter 按 floor zoom；这是显式选择，不宣称与 MapLibre stop-pair 插值逐像素相同。
输入只支持普通文本、字体数组和普通图标名，输出不泄漏 Formatted/ResolvedImage。

## Lifecycle and failure

基础 tile publication 与 symbol 准备分离。异步完成不直接触碰 GPU，
只在正常帧更新资源、place 与发布；pick/depth 使用最后快照，不发起请求或重新布局。
字体尚未就绪时基础地图继续显示；同内容/字体的旧标注 owner 在替代资源就绪前按独立 symbol 状态保留。
资源/缺字/不支持 geometry/预算失败带来源诊断，无无限 retry、字体替代或静默成功。
真实 Bright 街道级数据会引用 sprite 中不存在的名称。依据 MapLibre
`src/symbol/symbol_layout.ts::performSymbolLayout`，不存在的 icon entry 不产生 icon geometry，
文字仍可参与放置；`statistics.missingSymbolImages` 列出名称，公开页显示提示。
这不等同于 sprite 请求失败、损坏数据或 SDF icon：后者仍是明确的资源/能力错误。

glyph range/page 按 Layer 缓存；maximumGlyphRanges 约束数量，页面 dimensions 和 Context limits
共同约束单页，统计真实持有字节。当前候选/发布状态使用的页面不可 LRU 回收。
maximumSymbolCandidates 与 maximumSymbolRequests 限制候选与并发，截断数量进入统计。
资源销毁 exactly once；迟到 completion 不得复活已移除 Layer，缓存不依赖其他扩展。

GPU 命令维持样式顺序，普通避让标签按 atlas/material state 合批；
允许 overlap/ignore-placement 的层维持逐 feature 顺序，防止跨 atlas 重排颜色与 pick。
动态 non-indexed buffer 按实际 quad 数量分配，已有容量足够时复用；密集数据分块/Worker 属于 V3C1。
逐要素 pick ID 与实际 coverage/discard 相同，复用 Cesium 自动派生 command。
热帧复用 buffer、texture 和排版；相机/zoom/cover/资源变化只失效相应状态。

## Delivery

实现放在 SceneGIS Core/Renderer/Scene private 模块；GLSL 放在既有 Shaders/SceneGIS root，
由现有生成器编译，不编辑生成 JS。保留现有五个公共入口，扩充 Style/Layer 契约。
Specs、Test 本地 fixtures、公开页和 package qualification 同步验证。
本阶段不需要上游缝隙，后续若发现明确需求必须独立登记 SGP。
