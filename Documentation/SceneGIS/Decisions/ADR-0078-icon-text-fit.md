# ADR-0078：文字适配图标与 sprite 伸缩

- Status: accepted
- Date: 2026-09-17
- Scope: vector-tiles V5E
- Related: ADR-0063、ADR-0068、ADR-0077；无 SGP

## 决策

icon-text-fit 支持 none/width/height/both，padding 顺序 top/right/bottom/left。
使用 glyph advance 和 line-height 定义文字逻辑边界，排除 SDF border；fit 忽略 icon-anchor，
使用文字中心与 icon-offset。以当前 text-size 计算目标，再按 icon-size 缩放目标；
stretch 固定区域使用 sprite pixelRatio 的逻辑像素，保留边框，目标过小时不反转固定内容。

Worker 准备 content/stretch 元数据的切片、UV 与线性系数；主线程在既有 shape 缩放步骤解析系数。
允许多个有序、不重叠的伸缩区间。无 stretch 时整个轴伸缩；content 默认整图。
可变 anchor 的每个文字候选具有对应图标候选，选择与渲染/pick 共用；试放仍不污染已发布 shape。
参考 MapLibre GL JS src/symbol/shaping.ts、quads.ts 的语义，以本项目资源与批次契约自行实现。

## 结果与边界

不新增独立 texture、Worker、Shader 或 Cesium native primitive；资源仍由 Layer 统一拥有。
保守碰撞使用整个图标外框，透明角落按原 shader alpha 控制绘制和拾取。
不支持 SDF icon、sprite textFitWidth/textFitHeight 的比例规则、rich text 或复杂 shaping；
现有沿线文字可弯曲，但图标保持刚性，不能视为曲面盾牌变形。
