# ADR-0077：点标注的可变锚点

- Status: accepted
- Date: 2026-09-17
- Scope: vector-tiles V5D
- Related: ADR-0063、ADR-0068；无 SGP

## 决策

支持 text-variable-anchor 的九个标准位置和 text-radial-offset。候选字形在现有 Worker 中一次准备，
按 normalized size 缓存，主线程仅缩放、投影与碰撞。上次成功的位置优先，其他位置按样式顺序；
在允许 overlap 时仍先寻找无碰撞位置。所有尝试保持 collision 无副作用，只提交选中的图文组合。
普通 icon 不跟随文字换位；后继 icon-text-fit 可根据同一选中排版建立图标边界。

radial offset 单位为 em，方向随 anchor；对角距离按 sqrt(2) 分配，文字 baseline 使用 7/24 em correction。
有 variable anchor 而无 radial 时，text-offset 的绝对分量沿 anchor 方向应用；固定 anchor 的普通 text-offset 保持原语义。
计算参照 MapLibre GL JS 的 src/style/style_layer/variable_text_anchor.ts 与 src/symbol/placement.ts，
以本引擎现有排版契约自行实现，不复制上游运行时。

## 结果与边界

Planar/Globe、terrain、渲染和拾取使用相同选择；异步 placement 不修改当前已发布 shape。
现有保守碰撞代理、软预算、缓存和 glyph/sprite 所有权保持。复杂 shaping、沿线换位和
text-variable-anchor-offset 不在本阶段范围。候选最多九种，首次排版与试放成本随实际候选数增加。
