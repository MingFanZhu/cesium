# 平面地平线高度雾技术自审

- Type：review
- Status：approved；负责人视觉验收待定
- Owner / reviewer：当前任务，Architecture / execution；非独立评审
- Created / Updated：2026-10-20
- Target：`df7b55399a` 后本项工作区修改
- Plan：[有界修复](../plans/2026-10-20-planar-horizon-fog-composition.md)
- Decisions：ADR-0045、ADR-0052
- Upstream-owned files / SGP delta：无

## Findings

| Finding                                           | Severity | Disposition                                                                                                                          |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 天空提前加雾，clear-depth 文字边缘跳过最终衰减    | P1       | fixed；0 / 0.5 / 1 coverage 的实际 GPU 合成先失败后通过；实体和边缘的共同饱和透射为 0.3，alpha 不变。                                |
| 近水平光程几何中点跳到高空，雾的光源不连续        | P1       | fixed；`mu=±0.0001` 原蓝色偏差约 30%，修复后各通道相对水平值偏差小于 2%；解析反解的五个薄雾/水平/常密度/斜向路径累计吸收中点也通过。 |
| 两次冷编译超过 lifecycle fixture 的 30 s 默认超时 | P2       | fixed in fixture；仅将该测试超时设为 120 s，断言不变；实际约 32.6 s 完成，warm reuse、exact destroy、re-register 全部通过。          |

## 实现评审

Planar Background / Stars 移除提前雾，Aerial 先做天空的云影差值再统一加雾，
有限接收点和 cloud optical 的原顺序保持。Globe 原计算顺序不变。
光源代表点是单次 absorbed-transmittance quadrature 的中点，解析反解使用
小量展开覆盖薄雾、水平及常密度极限；不按相机角度分支或增加距离截断。

无公共 API、上游改动、LUT 资产改动、新 pass、纹理、buffer 或 listener。
固定一次照明取样和原查表数量；增加少量标量 exp/log 运算。
无手工修改生成 JS；执行正常构建更新运行产物。

## 验证与边界

- Development build 通过；新增 GPU 合成/连续性/反解回归通过。
- Planar final medium、Planar P10 shadow-prefix、Globe clear-depth fog 实际 GPU 回归通过。
- Planar Texture3D lifecycle 通过，共 5 项 focused Specs 通过。一次 Specs 重新打包遇到
  Windows 可用提交内存不足，限制该次 Node 的 GC heap 预算后构建、复测成功；
  无持久环境变量或构建脚本改动。
- 独立综合示例恢复原高度 2213 m、俯角 5° 与同一日照时间；
  连续 160 帧覆盖 1° 低俯角、升至 120 km / 25° 俯角并返回，无 renderError，
  检查原视角与两个关键帧。保留用户原页的实时操作，不回写旧相机。
- 同一浏览器、同一 1001×826 输入，交替执行修改前后 Aerial command，
  预热 4 次后各取 20 次；command 加同步单像素 readback 中位数为 4.1 / 3.9 ms。
  该测量包含驱动同步及回读，不冒充纯 GPU 时间或 FPS 提升。未见明显开销回归；
  持久资源成员仍为 16，固定 LUT、pass / draw / texture 数量均不变。
- Scoped ESLint、代码/ADR/本项 plan-review Prettier、全量 AgentDocs Markdownlint、
  `git diff --check` 通过。全量 AgentDocs Prettier 报 501 个文件的格式告警，
  包含扩展索引；未扩展为历史文档整体重排。无生成文件进入工作区差异。
- 早先 local-planet 撤销 review 中两项 legacy pixel fixture 的未决状态继续保留，
  本项未以无关全量测试替代已复现失败路径，不宣称其已修复。
- 雾的空间照明仍为单次近似；严格无限平面本身的远景色调不要求与球面相同。
  最终观感由负责人验收；本项按负责人要求形成本地提交。
