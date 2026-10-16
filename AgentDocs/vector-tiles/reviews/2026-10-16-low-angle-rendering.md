# 低俯角线宽与注记修复评审

- Type: review
- Status: approved; P1 symbol handoff fixed; owner visual gate passed
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review；非独立评审
- Target: [修复计划](../plans/2026-10-16-low-angle-rendering.md)
- Related: ADR-0062、ADR-0074、ADR-0161；SGP-0046

## Findings 与处置

- P1 / fixed：surface classification 丢弃跨出地表轮廓的 glyph。
  独立矢量通道保留全覆盖、实心注记深度和地形锚点可见性。
  证据：跨轮廓 GPU color/pick、linear/log、多视锥、山脊与 terrain anchor Specs。
- P1 / fixed：单一参考地图米宽导致低俯角近处过度放大。
  Flat 平面交点 / ground 实际地表深度驱动解析 width/gap/blur 收缩，正交与远处保持原语义。
  证据：Planar、Globe 椭球与 heightmap 近/中/远宽度及拾取；cap/join/dash/DPR 回归。
- P1 / fixed：native OIT 拆分破坏 symbol source-over 顺序。
  一次原顺序 premultiplied color，加一次 alpha>=0.995 depth-only；无双乘 alpha。
  证据：0.5 opacity 重叠红/蓝 glyph 精确混色回归。
- P1 / fixed：所有建筑按物理深度截字，不符合负责人明确的同地图样式层序。
  `SCENEGIS_VECTOR` 分离外部材质与地图建筑；建筑标签区分地图实例和样式层。
  证据：opaque/translucent 层序互换、不同地图、linear 多视锥颜色与 pick。
- P1 / fixed：仅忽略最终 G-buffer 的本地图建筑，会丢失其后方外部模型的深度。
  外部阶段结束时保留条件 R32F 快照，再画建筑；替代试验中的外部几何重绘。
  证据：真实 glTF Box 的 linear/log 隐藏模型遮挡、真实 3D Tiles、模型移除恢复。
  Color pick 在原绘制中输出外部和建筑深度，不借用颜色帧模型深度。
- P1 / fixed：半透明建筑和注记在不同视锥中会按距离重排。
  样式层序位于视锥循环之外，地形锚点另存跨视锥深度。
  证据：两种层序的 fractional alpha 多视锥混色、terrain 与拾取回归。
- P1 / fixed：新增 PASS 必须加入共享材质资格，不能使 AO/SSR/SSIL 拒绝建筑。
  更新 owned layout/effect/debug 的 pass 集合；无额外建筑材质重绘。
  证据：Planar/Globe 建筑的屏幕效果 Specs、原 deferred lighting/entry/annotations 全部通过。
- P2 / fixed：快照及借用 framebuffer 的生命周期必须明确。
  条件深度 resize/移除释放，borrowed views 不拥有外部附件；Scene teardown 清理。
  证据：warm texture identity、移除销毁、原 atlas/buffer/pick 生命周期回归。
- P1 / fixed：建筑移出 OPAQUE 后，post-process selection 的原 ID pass 集合遗漏建筑。
  SGP-0046 将 SCENEGIS_VECTOR 加入原 ID 绘制调度。
  证据：Planar / Globe 分别读取真实 ID framebuffer 并解析到 tower feature 的两项 GPU 回归。

## 验证

- Chrome Headless 155：累计 136 个不同相关 Specs 通过。
  原 84 项 VectorSymbols/VectorTileStyles/VectorGlobe 与 native background Label 回归；
  49 项 VectorExtrusion/anchoring、DeferredAnnotations/Lighting/Entry；
  另补 2 项 post-process selection ID 回归；隐藏模型由原一项扩成 linear/log 两项，补验 2 项通过（净增 1）。
- `npm run build` 通过；GLSL module / barrel 由原生成器生成，未手改或提交生成文件。
  没有公开 API、Worker、类型、构建器或发布协议变化，不扩大无关安装包矩阵。
- Scoped ESLint / Prettier、修改文档 Markdownlint、git diff --check 通过。
  AgentDocs 全量 Markdownlint 通过；全量 Prettier 保留既有 452 个历史格式问题，
  本次修改文件单独通过，不批量格式化无关记录。
- 公开地图保持默认环境开启。已检查负责人当前南京低俯角及建筑密集区
  118.78 / 32.045、heading 0、pitch -35 度、range 650；文字完整覆盖楼体。
  检查后恢复原相机。截图保存于忽略的 Build/vector-pass-buildings-review.jpg。
  2026-10-16 负责人确认视觉 gate 通过。

## 成本与边界

建筑密集区 1001×826、155 symbol batches、2 frusta：620 次颜色/实心深度提交，
无新 glyph 顶点流或 atlas。既有 RG32F annotation depth 为 8 bytes/pixel。
本视图无外部模型，外部快照不分配；新增跨视锥地形 R32F 为 3,307,304 bytes（约 3.15 MiB），
每帧两次屏幕复制。外部物体与地图建筑、注记同时出现时另需 4 bytes/pixel 外部深度；
每视锥一次屏幕复制，几何不重放。Pick 仅有符号时激活条件资源，
外部/建筑目标分别 4/8 bytes/pixel，原始几何用 MRT 同次写入。

120 个 warm frames 的 preUpdate→postRender 中位数 4.6 ms、P95 9.5 ms，
glyph 上传增量 0，当前已加载可见瓦片失败数 0，浏览器无运行时错误。
这是本机当前视图观测，不是严格前后 benchmark，不宣称帧率或性能提升。

本次明确不透明世界路径。透明 Globe/Planar 仍沿用此前合成契约；不扩展任意地下/背面覆盖，
不将混合透明排序描述为物理精确解。注记仍接受环境衰减，半透明覆盖不写实心深度。

## 上游与交付

### Fixed: P1 注记在 render cover 与 placement 交接时提前隐藏

- Status: fixed；Owner: 当前 Architecture / implementation Agent。
- 负责人视觉反馈后，在公开球面页沿视轴后退并返回、跨 source LOD 复现。
  旧批次 102 个已排版注记中 97 个 currentOwner 为 false，可见数为 3；
  约 0.4 秒后 placementCommits 增加，可见数恢复至 148，该段 pendingRequests 为 0。
  同层平移对照没有出现旧候选的 cover 归属失效。
  逐帧观测保存于忽略的 Build/vector-symbol-lod-handoff.json。
- `_SceneGISVectorSymbols.js` 中 drawCandidates 在新批次完成前即要求当前 render cover
  持有旧候选；content 改变取消排版，2 ms 分帧预算使恢复跨帧。placement 还会提前销毁
  不再属于下一批 requirements 的已发布分组。该文件未被本轮 PASS 实现修改。
- 首次反馈轮仅完成诊断，未改运行时代码。
  既有 delayed LOD 测试只覆盖请求未完成及最终 loaded 状态，未覆盖中间分片交接。
- 负责人确认方案后，已按 [plan](../plans/2026-10-16-low-angle-rendering.md) 修复：
  旧显示批次不受后续 render cover 的归属变化影响；待发布批次等待 glyph/sprite、Worker
  shaping 和 collision 完成后原子发布显示及拾取。已有分组和页面保护到提交成功。
  当前 style 重新求值，visibility/filter/min/max zoom 继续即时隐藏；Shader / PASS 未改。
- 资源：单批需求及稳态 cache 上限不变，交接额外保护旧显示页面，总数最多两批上限；
  取消的未发布页面可 LRU 淘汰，提交后释放超额 cache。边界已记录 ADR-0068 和 API JSDoc。
- 自动化：85 项 VectorSymbols / VectorGlobe / dynamic rules 通过。
  新增 3 项覆盖延迟 glyph+shaping 的显示/拾取、满 cache 的旧纹理存活及释放、
  等待期间 visibility 和 filter 隐藏；原 delayed LOD 增加分片期间逐帧显示和拾取，
  原 cache 测试覆盖取消后不积累第三批及单批超限拒绝。
  该组也包含地形锚点、地形遮挡、外部 Model / 3D Tiles、同地图建筑层序和资源释放资格。
  后续去除 shape 热路径临时页面数组后，仅补验直接相关 6 项，不扩大无关矩阵。
- `npm run build`、scoped ESLint / Prettier、相关 Markdownlint 及 diff check 通过。
  无类型签名、Shader、Worker 协议或构建器改动，未新增上游修改。
- 公开地图 300 帧缩放往返：103 帧保留退出 render cover 的旧注记，最多 65 个；
  可见数最低 60，最终 157，symbolFailures=0，浏览器无运行时错误。
  ranges 峰值 143 / 配置 192；纹理保持 16,660,480 bytes。
  后段 160 warm frames 的 CPU 帧中位数 6.8 ms、P95 11.6 ms；
  非严格性能前后比较，不宣称帧率提升。逐帧记录和截图分别为忽略的
  Build/vector-symbol-handoff-after.json、Build/vector-symbol-handoff-review.jpg。
- 原视角已恢复。技术 finding 关闭；2026-10-16 负责人确认最终画面验收通过。

改动过的 upstream-owned files 仅：

- `packages/engine/Source/Scene/Scene.js`：vector material/annotation/pick 阶段窄 hook。
- `packages/engine/Source/Renderer/Pass.js`：追加 `SCENEGIS_VECTOR`，不重排已有枚举值。

两者均使用 SGP-0046 成对标记，manifest / ADR 互相引用。其余实现、Specs、文档为 SceneGIS-owned。
当前 scenegis/develop，WebGPU stash 保留；无新 worktree、SDK 修改或远端 push。
本修复视觉验收通过并形成独立本地 checkpoint，不推送；D2 的独立 gate 不由本修复代替。
随后提出的另一视角整层不显示问题独立诊断，不混入本次已验收修改。
