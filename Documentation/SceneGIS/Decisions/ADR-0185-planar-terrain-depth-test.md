# ADR-0185：平面地形深度测试开关

- Status: accepted
- Date: 2026-10-23
- Owners: Project Owner（要求补齐同名原生属性）、Architecture / Execution
- Plan: [standalone plan](../../../AgentDocs/planar-world/plans/2026-10-23-terrain-depth-test.md)
- Related: ADR-0001、ADR-0023、ADR-0161；SGP-0001

## 事实与决定

Cesium 1.144 基线 `6d5d8b1f0725b6f831b336463f4b11c98023427b` 的 Globe
开关通过 Scene 在地形分类之后清除深度实现，并非关闭地形 command 的 depthTest。
平面场景没有 Globe，先前始终保留地形深度；ADR-0023 的默认行为继续成立。

增加可写布尔属性 `world.depthTestAgainstTerrain`，默认 true，保留现有平面画面。
false 使普通不透明、透明及注记内容忽略地形遮挡，内容彼此之间仍按原有深度规则绘制。
这是与 Globe 相同的属性和作用范围，但 Globe 的原生默认 false 保持不变。
不增加 constructor 或 Viewer option；requestRenderMode 下调用方请求下一帧。

SGP-0001 让 Scene 接受非 Globe primary world 的可选结构能力：仅显式 false 且
world.show 时清除地形深度；没有该成员的既有 custom world 保持原行为。
原 Globe 分支不变，球面背面遮挡用的 DepthPlane 不用于平面。

清除仍位于地形及贴地分类之后，保留 czm_globeDepthTexture 和延迟材质/线性深度。
复用现有地形快照及条件深度捕获，不新增 pass、附件或 geometry replay。
多视锥透明深度恢复对 Globe -3 / Planar -5 地表一致处理，并在视锥遮挡判断前跳过
被关闭的地表深度；普通对象和 depth-writing annotation 仍恢复深度。

原生 Billboard 的 fragment shader 还按 u_coarseDepthTestDistance 直接测试地形深度纹理。
清除主深度本身不能关闭此检查。现有 owned DeferredAnnotations 在正常命令准备入口浅复制
Billboard/Label 命令，仅在非 Globe World 使用实例缓存的 uniform map：开关 false 时该距离
为 0，否则保留原函数值。颜色、ID pick 与 depth-only 共用此显式适配，不修改原命令或
BillboardCollection、不改写 caller 的 disableDepthTestDistance，也不改变对象之间的硬件深度测试。
无额外 Shader variant、GPU 资源或 draw；Globe 命令不进入该适配。
多视锥 native 注记的 opaque / fractional guard 同样忽略正 tag 的 Planar 地形，
借用既有 material texture 判断 -5 group；负 tag 的已绘制注记和其他实体仍遮挡。
只扩展现有 shader 的 uniforms，不增加变体数量或纹理分配。

scene.pick、drillPick 识别可见对象；pickPosition 延续既有深度拾取策略。原生单视锥
PickDepth 会合并地形与场景深度，开关不承诺穿透地形获取地下对象坐标，也不在此增量改写
多视锥既有拾取实现。独立 world.pickTerrain、getTerrainHeight 继续读取实际地形。
透明地表仍按 opacity / pickTranslucentDepth 契约运行。
默认/显式 Planar 环境不接管此属性；沿用既有 deferred 最终可见深度，不模拟 Globe
EnvironmentEffects 的专有深度所有权。

## 取舍、交付与升级

拒绝关闭地形 depthTest/depthMask：这会破坏贴地分类和地表深度来源。拒绝逐对象覆盖
renderState 或关闭所有 depthTest：这会破坏对象之间的遮挡并增加侵入范围。

属性由现有根 barrel、JSDoc 和类型生成发布，不手工修改生成物。只有 Scene.js 是
本增量修改的 upstream-owned file，复用 SGP-0001；owned shader 无补丁标记。
升级时复核 classification→clear→content 顺序、ID pick 清除以及 deferred 地表 group。

验证见 [review](../../../AgentDocs/planar-world/reviews/2026-10-23-terrain-depth-test.md)：API、真实 GPU 可见性/拾取、贴地、多视锥透明与恢复、Globe 回归、
资源身份/销毁、dev/release build 和类型检查。
