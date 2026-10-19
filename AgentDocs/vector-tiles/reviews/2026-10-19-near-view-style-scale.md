# 近地文字与填充边缘尺度复审

- Type: review
- Status: approved; owner visual gate passed
- Created / updated: 2026-10-19
- Owner: 当前 Agent，Architecture / implementation self-review，非独立评审
- Target: [standalone plan](../plans/2026-10-19-near-view-style-scale.md)
- Discussion: [尺寸方法复审](../discussions/2026-10-19-near-view-style-scale.md)
- Baseline: `scenegis/develop@729dc4bbd0`
- Related: ADR-0062、ADR-0065；SGP 增量：无

## Finding 与处置

- P1 / fixed / Architecture：首轮深度比例 clamp 没有约束离轴投影伸长。直接调用实际
  `Projection.shape`，120° FOV、5° 俯角、anchor depth 12 m、reference depth 80 m，
  旋转 56° 的 8 px quad 在可见 x=18 m 位置投影边长 14.09 px。
  改用地表到 CSS 屏幕 Jacobian 的最大奇异值约束统一地面比例，修复后同一边为 7.74 px。
  包含透视除法离轴项、局部 Globe 度量及地形坡度；geometry、advance、collision 共用。
  负责人选择远景继续透视缩小，因此移除旧 0.5 blend，不采用固定屏幕宽高的逆变换。
  新增反例回归及近/中/远、正交、连续倾角与碰撞包络检查，53 项 Symbols 通过。
- P1 / fixed / implementation：新增 fringe 导数不能置于非一致 `discard` 之后。
  依据 GLSL ES 3.00 §6.4，flat 在 main 入口求导，ground 对变化 fringe 延后原有片元
  剔除到求导之后；常值 core 保留提前剔除。不是新增俯角分支，未改变裁剪条件或资源协议。
  Styles / Ground / Globe / Patterns 共 76 项回归通过。
- P1 / fixed / implementation：窄覆盖放大插值残差，Globe 独立边求交的权重和误差及 flat
  常值 1 的透视插值舍入会削弱 core alpha。真实 DPR=2、斜边测试复现红色 128 降至 120。
  改为插值零 core 距离，并在 ground 使用保持常值的 affine interpolation；保持核心颜色
  128±1 的断言。Flat / Planar ground、Globe 椭球及 heightmap 四项 fill 专项通过。
- P2 / fixed / test：首轮 DPR 用例同时放大 CSS 和 drawing buffer，不能验证真实像素密度。
  改为固定 128×128 CSS、分别使用 128/256 drawing buffer，加入 camera roll 的斜边采样。
  验证核心颜色、外部零覆盖、窄过渡、颜色与 pick 一致以及 warm 资源复用。

## 验证与交付

- 开发版相关 Specs 共 129 项：Symbols 53、Styles 12、Ground 18、Globe 34、Patterns 12。
  Shader 四项专项包含在这些 suite 中，不重复累计。Globe suite 的符号部分早于最终
  Jacobian 替换，最终发布版另复验 variable anchor / fitted icon / pick 的 Globe 集成。
  日志保留在忽略的 `Build/vector-near-method-symbols.log` 与 `Build/vector-near-review-*.log`。
- 旧实现先复现三项失败；方法复审另验证宽视场反例，不把首轮通过数量当成最终方案证据。
  测试筛选器只支持子串，首次用竖线组合筛选得到零项，已改为逐项执行，不计为通过。
- `npm run build`、`npm run build-release` 与 scoped ESLint 通过；私有投影和 Shader 修改
  未扩大公共 API、类型、构建入口或 Worker 协议，不重复无关类型/安装包矩阵。
- 修改范围 Prettier、全 `AgentDocs/**/*.md` Markdownlint、`git diff --check` 通过。
  按目录规则运行的全 AgentDocs Prettier 仍报告 452 个已有文件格式问题；本轮改动文件
  全部通过，不为本缺陷格式化无关历史文档。基线所有权审计确认 15 个修改/新增文件中
  upstream-owned files 与生成文件均为零。
- 最终发布版 7 项专项通过：flat / ground / Globe 椭球及 heightmap 四项 fill、浅俯角
  road-label、离轴反例、Globe variable anchor / fitted icon / pick。日志为忽略的
  `Build/vector-near-final-release-0.log` 至 `-3.log` 和 `-globe.log`。
- 当前公开页恢复原位置、direction/up 和 HDR/曝光配置。原俯角约 1.09°、1001×826
  drawing buffer：26 visible/rendered tiles、963 drawCommands、49 placedSymbols，
  failedTiles、symbolFailures、pendingRequests 均为 0。最终截图保存在忽略的
  `Build/vector-near-method-final.jpg`；8° 稳定视角截图为 `Build/vector-near-method-tilt8.jpg`。
- 正常 `requestAnimationFrame` 驱动的 121 帧连续倾角往返：约 1.09°→8°→1.09°，
  每帧记录实际投影字形、cover 与绘制状态。Visible tiles 始终 26，无整层 draw=0 帧，
  symbolFailures=0；每帧至少 10 个被测近景标注，首字形被测边长/标称边长最大 1.0301。
  轨迹与性能数据为忽略的 `Build/vector-near-method-evidence.json`。验证结束恢复原相机。
  首次临时脚本错误使用模块页面不存在的 `Cesium` 全局而中止，修正为直接向量运算后
  完整完成上述 121 帧；不把中止运行计为通过。
- 有界 warm 测量为 20 次手动 render，使用 GPU timer query 且无 disjoint。
  相同 viewport、26 rendered tiles、963 drawCommands，复审前深度比例版本 CPU 中位数/P95
  为 18.0/23.8 ms、GPU 为 9.99/12.42 ms；最终版本 CPU 为 16.0/28.3 ms、GPU 为
  9.45/10.47 ms。最终 placedSymbols 为 49，比较基线为 48；中位数没有上升，但 CPU 尾部
  有波动，20 样本不能支持稳定性能提升或所有视角帧率保证。新成本边界明确保留。

## 成本、所有权与边界

尺寸 helper 每次增加两个既有地表取样及常数次矩阵运算；不增加 GPU 资源或资源所有者。
Fringe 仍使用现有保守包络，对变化 fringe 的已拒片元延后剔除会多做曲面逆投影。
源码未修改 source SSE、style zoom、样式 min/max zoom 或覆盖预算；无俯角阈值。

Upstream-owned files：无。SGP：无新增或修改。未修改 SDK、构建配置、测试示例或生成文件。
局部 Jacobian 不能保证跨越明显深度/地形变化的有限字形每条边严格不超过标称值；
仍保留贴地压缩和已有曲线排布。远景不足一像素的 fringe 包络保持，未扩张为新的屏幕几何。
不宣称解决整片地表的空气透视、样式阈值显隐或瓦片数据简化，也不宣称所有设备性能资格。
8° 时 style zoom 增加，既有建筑/POI 样式显隐仍生效。公开样式累计报告 7 个未提供的
sprite 名称，tile/symbol failures 仍为零；本次没有改动外部样式或用替代图标掩盖该状态。
2026-10-19 负责人确认效果并明确要求提交本修复，本轮视觉 gate 通过。Architecture 确认
技术与人工验收完成，形成独立本地 checkpoint，提交号由本文件 Git 历史定位；不推送。
D2 动态规则视觉 gate 独立保留，不以本次验收代替。
