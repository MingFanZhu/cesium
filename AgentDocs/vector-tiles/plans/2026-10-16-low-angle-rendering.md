# 低俯角线宽与注记修复

- Type: standalone plan
- Status: completed; owner visual gate passed
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review
- Architecture review: confirmed
- Parent: [Vector Tiles](../README.md)；独立于仍待人工验收的 D2 动态样式
- Related: ADR-0062、ADR-0064、ADR-0074、ADR-0161；SGP-0046

## 确认目标

负责人确认限制近处线宽放大，保留贴地和远处透视收缩；注记跨越地表轮廓时保持完整。
后续明确同一 SceneGISVectorTileLayer 的建筑与注记遵循 Style.layers 顺序，
保留地形以及外部 Model / 3D Tiles 遮挡，并明确允许独立矢量 PASS。
本轮继续当前 scenegis/develop，不新建工作区，不修改 SDK，不推送；保留 WebGPU stash。

## 源码事实与实现

1. 原线宽以视轴参考位置将 CSS pixel 转成地图米宽，近处额外透视放大约 4.3 倍。
   现有解析覆盖乘以 `min(1, eyeDepth / referenceDepth)`，正交投影保持 1。
   同步缩放横向 gap、边界与 blur；保留 offset、纵向 dash/pattern station、style zoom 与 source LOD。
   不改变 Worker 协议、几何缓存或新增米制 API。
2. 原 symbol 位于 surface classification，超出物理地表轮廓的部分会被 lighting resolve 丢弃。
   不透明世界的建筑与注记进入 `SCENEGIS_VECTOR`。外部物体先收集材质，
   再收集地图建筑，共用 G-buffer 与一次延迟光照；地表 fill/line 保留原接入。
3. 建筑材质空闲 RGB 保存 frame-local 地图/层序，注记区分本地图建筑与外部物体。
   仅在建筑、注记、外部物体同时存在时，保留 R32F 外部深度，防止建筑后面的模型遮挡信息丢失。
   多视锥地形注记另外保留 R32F 地形深度，避免最后一个视锥覆盖先前锚点数据。
   每种快照为 4 bytes/pixel，每视锥一次屏幕复制，不重绘外部几何。
4. 注记与半透明建筑按样式层序合成，样式循环位于视锥循环之外；建筑实体保留物理深度关系。
   symbol 先绘制全部 premultiplied color，再将 alpha>=0.995 写入既有 annotation depth。
   此前直接拆到 OIT 会把 0.5 红/蓝 glyph 混成 95/95，破坏原有 64/128 source-over，因此不用该方案。
5. Color pick 在原始外部/建筑绘制中以条件 MRT 保存外部 R32F 与建筑 RG32F，
   最后按相同层序绘制符号 ID。保留 native 地形锚点可见性、clip、alpha 和 log depth；
   不借用上一颜色帧的模型深度，不重放模型几何。
6. Native Billboard/Label、透明 Globe/Planar 的已有独立协议保持；不扩展透明世界或水面折射语义。
   Atlas、顶点流、字体请求与 placement 缓存保持。

## 验证与退出条件

- GPU：近/远/正交线宽、真实地形、gap/cap/dash、颜色与拾取。
- 建筑/注记层序互换、半透明混色、地图实例隔离、跨线性视锥排序。
- 藏在地图建筑后的真实 glTF 与 3D Tiles 继续遮挡注记；模型覆盖 linear/log、移除恢复与拾取。
- 地形山脊、terrain anchor、地表轮廓、资源复用和释放。
- 原建筑材质、AO/SSR/SSIL、native annotation、延迟入口回归；build 和 scoped 静态检查。
- 公开地图默认环境、建筑密集区画面及 warm frames 成本；负责人视觉判断为最终 gate。

## 结果与交接

当前累计 136 项不同的相关 Specs 通过：原 84 项矢量/原生注记回归，49 项延迟/建筑集成，
补充 2 项 post-process selection ID 回归，并将原隐藏模型案例扩成 linear/log 两项（净增 1）。构建、静态检查及画面证据见
[评审](../reviews/2026-10-16-low-angle-rendering.md)。
上游仅修改 Scene.js 调度及 Pass.js 枚举，均登记 SGP-0046。
2026-10-16 负责人确认视觉验收通过，本修复建立独立本地 checkpoint；D2 的独立视觉 gate 保持待验收。

## 视角变化时注记空档：已修复

负责人报告移动时注记消失后恢复。公开球面页实测跨 LOD 缩放：
旧批次 102 个已排版注记中，97 个在新排版提交前失去当前 render cover 归属，
可见数降至 3；约 0.4 秒后新批次提交，可见数恢复至 148。
该段 pendingRequests 为 0。普通同层平移对照未出现 cover 归属失效。

根因位于现有 symbol runtime：drawCandidates 立即按 currentOwner 隐藏旧候选，
而 placement 按每帧 2 ms 分片，content 改变又取消重启；placement 中还会在 commit 前
删除下一批不再需要的 atlas 分组。这些逻辑早于本轮独立 PASS 改动，不能以 PASS 排序修复代替。
首次按用户问题完成定位，未更改运行时代码。修复将已发布注记与待发布排版的生命周期分离，
保留仍适用且在当前视域内的旧注记至新批次可发布后原子切换；仍即时遵守样式隐藏、
地形/外部模型遮挡及图层销毁，保留资源上限、去重与拾取身份。
补充跨 LOD、分帧排版期间逐帧显示/拾取测试，不能只检查请求期间和最终 loaded 状态。

负责人已确认原子替换方案。本轮仅修改 SceneGIS-owned symbol runtime / assets、Specs 和文档：

1. 已发布候选不再因 render cover 归属切换而提前隐藏；仍按当前相机、当前样式可见性、
   zoom/filter 与已有 GPU 深度协议绘制。正常隐藏/销毁继续清空。
2. 收集、字形请求、Worker shaping 与 collision 在待发布批次中完成；资源等待时挂起 generator，
   资源版本变化后继续，不发布缺少待完成候选的空批次。分组和 pick ID 在成功发布后统一替换。
3. 旧批次 atlas 页面保护到提交；新需求仍最多 maximumGlyphRanges，交接期间允许额外保留
   旧发布批次使用的页面，合计最多两批上限，提交后回收超额缓存。反复取消不能累积第三批。
   此有界暂存成本及旧 owner 退出语义修订记入 ADR-0068。
4. 自动化覆盖预算分片中的 LOD 交接、延迟新 glyph/shaping、拾取身份、资源释放和即时样式隐藏；
   运行完整 VectorSymbols 以及必要的 Globe/动态样式回归，再沿公开地图同一缩放轨迹复验。

结果：85 项 VectorSymbols / VectorGlobe / dynamic rules Specs 通过，其中新增 3 项，
并强化原 delayed LOD 与 glyph cache 资格。构建及 scoped 静态检查通过。
公开页 300 帧缩放往返，103 帧保留退出 render cover 的旧注记，最多 65 个；
全程可见数最低 60，末尾恢复 157，未出现此前个位数空档。
glyph ranges 峰值 143（配置 192），纹理 16,660,480 bytes 保持不变，symbolFailures=0。
恢复原视角；P1 技术关闭，2026-10-16 负责人确认视觉验收通过。
本地 checkpoint 由 Git 历史定位，不推送远端。负责人随后反馈另一当前视角下整层不显示，
作为后续独立诊断，不撤销本轮注记交接修复的验收。
