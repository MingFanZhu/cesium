# Phase Plan: V5B 平面沿线与特殊标注

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Owner / reviewer: 当前 architecture/execution Agent，自审
- Created / Updated: `2026-09-13`
- Entry checkpoint: `50ab83b96f`，V5A 完成，负责人授权继续特殊标注
- Architecture review: `approved`，细化已批准的沿线、路牌、箭头范围
- Discussion: [Symbol architecture](../discussions/2026-09-13-symbol-architecture.md)
- ADR: [ADR-0065](../../../Documentation/SceneGIS/Decisions/ADR-0065-line-symbol-placement.md)
- SGP: None

## Current source facts

V5A 已有 glyph PBF / sprite cache、横排 metrics、联合 collision、自有动态 quad batch、
RTE world anchor 与屏幕 offset，normal update 发布、pick/depth 复用。
MapLibre 参考的 `symbol_layout.ts` 对 line 裁切后重采样，line-center 取路径中心，
point + LineString 使用首顶点；`projection.ts` 按每个 glyph 的 advance 沿线取位置和切向。
Bright / Liberty 剩余各 10 个 symbol layers：5 个道路/水系名称、3 个路牌、2 个单行箭头。
路牌使用预制 sprite 和 viewport rotation；无需 icon-text-fit 或 SDF icon 即可接入原始属性。

## Implementation

1. Style 支持 line / line-center、symbol-spacing、text-max-angle、text/icon-rotate 与 keep-upright，
   解开 map/viewport alignment；保留整数 layout / 连续 size 契约和显式不支持诊断。
2. 私有 Core line helper 实现折线测距、区域裁切、anchor 重采样、逐 glyph 曲线排布与转角检查。
   point + LineString 按参考使用首顶点；Polygon point placement 留待后续能力。
3. Scene 按实际 resident cover 确定 anchor ownership，使用完整路径判断文字能否放下；
   文字不按基础 region 逐片元裁切。重复名称在同一层进行屏幕间距抑制，避免邻 tile 双标。
   Tile 内 anchor 间距依 canonical LOD 与 overzoom 换算，避免浅角粗瓦片产生海量远景候选；
   不强制所有瓦片使用一个 source LOD，不修改影像/地形选层。
4. map pitch 的每个 quad corner 转真实世界坐标；viewport pitch 使用屏幕旋转 quad。
   沿用现有 RTE vertex protocol 与自动 pick，CPU 投影相同顶点用于逐 glyph collision。
   keep-upright 依据投影阅读方向翻转文字路径；箭头默认保留有向线，不跟随文字翻转。
5. 新增 `Test/vector-tiles/line-symbols.html` 的确定性曲线/反向/短线/锐角/路牌/箭头场景；
   公开 Bright/Liberty 接入这 10 层原始样式。更新 fixtures、兼容清单与审查记录。

## Validation and exit

负责人追加公开页 FPS 诊断，最新要求使用 Viewer 默认持续渲染和原生
`debugShowFramesPerSecond`；已移除最初的自定义计时面板与渲染模式开关。
原生 MS 是帧间隔，原有 60 帧 CPU 提交测量保持独立。3 项公开页本地 E2E
验证原生面板、默认模式与既有场景行为，不以机器 FPS 数值作为 hard gate。
这不激活 V3C1 性能优化，也不代表沿线画面已验收。

交互验收追加修复（2026-09-13）：固定南京 1141×1150 CSS、60 帧 pan/zoom/rotate，
预热一轮，采样一轮；CPU median 为 139/181/179 ms，Profiler 主要热点为对被过滤要素仍执行的
evaluateProperties/styleFeature，其次为重复标注布局与缩放整 tile GPU 重建。保存 HAR 在忽略的 Build 中，
修复后同数据重放。先提前 filter、按 tile/integer layout 缓存可用标注及 anchors、按 style layer
缩小几何失效范围，再依据剩余 profile 修正；不通过降低标注密度或停止交互重排掩盖问题。
回归必须覆盖 fractional paint、integer layout、拾取/资源复用和清理；这属于当前 V5B 验收缺陷，
不提前引入 V3C1 的通用 Worker、字节预算或新公开 API。

已实现：预过滤和 tile layout/anchor 缓存；只给可见 anchors 更新 fractional size/paint，
复用未变 layout、编码坐标、shape key 和 same-anchor identity；每轮 placement 只快照一次 Camera getters。
平面比例直接用已知 eye distance 调用 frustum.getPixelDimensions，避免大坐标往返误差导致 rotation 重建。
几何 key 按实际 camera 值及单独 style layer 失效；feature-independent line/fill paint 使用
constant attributes，圆角按二次幂半径上界保留原 chord error，超界重建期间保持旧 paint。
未改 Shader/上游文件；当前 129 项 vector Specs 和 9 项本地 E2E 通过。

远景验收追加（2026-09-13）：负责人要求浅俯角远处拥挤的注记可以不显示。
透视下以 style scale 的视轴地面交点为参考，anchor eye depth 超过参考距离四倍时，
其投影比例已低于参考的四分之一（相差两个 zoom levels），在 glyph/sprite 需求、shaping、
collision 和 pick IDs 分配之前排除整个候选。Point、沿线、路牌、箭头共用此规则；
正交不做距离剔除，俯视同一平面的 depth 相同所以不受影响。继续保留地图与 mixed SSE cover，
不按 source tile level 或屏幕顶部固定像素带隐藏。当前不增加公开配置或 fade transition。
验证近/远候选资源需求与真实像素/pick、相机接近后恢复、正交与俯视，以及现有 5° 公开页回归。
该规则已在 projection snapshot / candidate visibility 实现；原有 129 项 vector Specs 通过，
新增两项并修正 fixture 的合法 glyph range / 可见 style zoom 后，20 项 symbol Specs 通过。
先执行 engine build 再运行 workspace Specs；当前 gulp test 本身不刷新 engine Specs bundle。

- Core Specs 覆盖裁切/间距、曲线路径逐字、反向阅读、max-angle、短线拒绝、联合避让。
- 真实 Scene Specs 覆盖地图倾斜与 viewport 路牌、alpha pick、相机重排和资源销毁、邻 tile 重复。
- engine build 完成后顺序运行 focused vector Specs，再运行本地 E2E；公开样式 E2E 不依赖公网。
- 新页面以实际像素/拾取及旋转、倾斜、缩放、重建验收；有限公开地图 smoke 与 warm CPU 记录。
- 私有实现无新增公共 API 或 Shader source 时复用 V5A 类型/发布边界，仍执行相关 build 与 tsc。
  如实际修改 Shader 或公共 API，则补对应完整资格。
- 更新 ADR/兼容文档/review，留负责人视觉 gate；通过后形成独立 V5B checkpoint，再进入 V3C1。

## Boundaries

本轮不承诺逐像素复制 MapLibre 的 anchor 相位、stop 插值、动画或跨 tile 语义道路拼接。
仅使用已经驻留的路径，缺少完整可容纳文字的路径时不画半个名称；不推断未加载道路连接。
复杂 shaping、variable anchors、rich text、icon-text-fit、terrain/Globe 仍保持明确边界。

## Execution and current gate

- 计划内容已实现；复用原有 Shader/RTE protocol，通过每个 corner 的 world position 或 CSS offset 绘制。
- 顶点切向取角平分线以消除路径反向的不一致；负 clip Z 的有效近视锥由私有 eye-relative projection 正确处理。
- 在线 z16 轨道浮点误差影响 minzoom gate，已在相机计算端吸附距整数小于 1e-10 的误差；
  不改变显式 Style.evaluateLayer 输入和一般连续缩放。
- 129 项 vector Specs、9 项页面 E2E、engine/root build、ESLint/tsc 通过。
  原始 Bright/Liberty 各增加 10 个 symbol layers，本地图集与在线 Berlin 道路/路牌/箭头已检查。
- 技术自审通过，证据与剩余边界见 [review](../reviews/2026-09-13-v5b-line-symbol-review.md)。
  负责人于 2026-09-13 同意进入远景处理，按继续授权关闭本阶段 gate；共享远景限制独立推进。
- 负责人提出将远景限制前移到共享平面瓦片选取，已记录
  [架构讨论](../discussions/2026-09-13-planar-distant-tile-loading.md)。
  该议题涉及影像/地形和 World 契约，本 phase 未将其混入 symbol visibility 私有规则。

V5B 在本地独立 checkpoint 中关闭；后续远景处理必须保持俯视拉远的原选层。
V5B-R13 移交共享选择层阶段，不将它描述为本阶段已修复的加载问题。
