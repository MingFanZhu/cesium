# 平面影像线性输入评审

- Type: review
- Status: approved（技术检查完成，项目负责人视觉验收待反馈）
- Reviewer role: architecture
- Updated: 2026-10-21
- Target: 平面影像进入共享线性渲染管线的颜色边界
- Plan: [修复计划](../plans/2026-10-21-imagery-linear-input.md)
- ADR: ADR-0031、ADR-0032、ADR-0161
- SGP: None

## Finding

- P1 / fixed / execution：Planar 栅格影像缺少 gamma 解码，直接写入线性材质缓冲。
  同源 World Imagery、identity 滤镜下偏白；环境关闭后仍存在。旧测试的 gamma=1
  掩盖错误。应在每层滤镜之后、alpha 合成之前解码，只影响栅格影像，保留 Material
  和 baseColor 输入；原 ADR-0031 的颜色空间前提需要显式修订。
  已在每层合成前补齐解码并修订 ADR；中灰 128 → 186 的失败回归已转绿。

- P2 / fixed / execution：既有 Surface 测试把默认天空当成黑色、把雾后的红色当成纯红，
  在当前时刻影响多视锥透明测试和浅视角覆盖测试。测试 helper 显式关闭默认环境，
  保留 gamma=1 的既有几何/合成验证，新回归单独使用 gamma=2.2。

## 验证与剩余风险

- Chrome Headless 155 / Windows / WebGL validation：Surface + Shader 共 52 Specs 通过。
  新增 4 项覆盖中灰、彩色、逐层透明混合、非默认滤镜、原色匹配、负通道、HDR/LDR、
  Material、baseColor、半透明 Surface、warm identities 与释放。修复前新增项 4/4 失败。
- 完整 `npm run build`、相关 ESLint 通过；生成物未手工修改或纳入提交。
- 本轮文件 Prettier、全量 AgentDocs markdownlint 与 `git diff --check` 通过。
  全量 AgentDocs Prettier 仍报告历史文件格式告警，本轮修复目录的修改文件均通过，
  未为消除历史告警批量改写其他扩展记录。未改公共 API，未重复运行类型生成与 release。
- 当前两页同一时刻，环境启停下均完成截图观察；无 console error。启用环境时仍有几何 / 雾
  差异，不能把输入颜色一致等同于最终画面逐像素一致。页面状态已恢复。
- 60 帧固定场景同步耗时 1.0 → 1.1 ms（中位数）、1.8 → 1.9 ms（P95），draw 与资源数不变；
  该样本不是通用 GPU 性能保证。
- upstream-owned files：无；SGP：无。非默认滤镜沿用 Planar 显示 RGB 语义，未复制 Globe
  特殊 `APPLY_GAMMA` 语义；Material 与矢量叠加未增加颜色转换。
- 2026-10-21 项目负责人已授权本地提交；后续视觉反馈继续跟进，无需新增补偿参数。
